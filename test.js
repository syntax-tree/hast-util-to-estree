/**
 * @typedef {import('estree').Program} Program
 * @typedef {import('estree').Node} Node
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Content} Content
 * @typedef {Root | Content} HastNode
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import babel from '@babel/core'
import fauxEsmGenerate from '@babel/generator'
import {fromJs} from 'esast-util-from-js'
import {toJs, jsx} from 'estree-util-to-js'
import {attachComments} from 'estree-util-attach-comments'
import acornJsx from 'acorn-jsx'
// @ts-expect-error: untyped.
import toBabel from 'estree-to-babel'
import {walk} from 'estree-walker'
import {h, s} from 'hastscript'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toHast} from 'mdast-util-to-hast'
import {mdxFromMarkdown} from 'mdast-util-mdx'
import {mdxjs} from 'micromark-extension-mdxjs'
import {visit} from 'unist-util-visit'
import {toEstree} from './index.js'
import * as mod from './index.js'

/** @type {(value: unknown, options?: import('@babel/generator').GeneratorOptions) => {code: string}} */
// @ts-expect-error Types are wrong.
const generate = fauxEsmGenerate.default

/** @type {['mdxFlowExpression', 'mdxJsxFlowElement', 'mdxJsxTextElement', 'mdxTextExpression', 'mdxjsEsm']} */
const passThrough = [
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'mdxjsEsm'
]

test('toEstree', () => {
  assert.deepEqual(
    Object.keys(mod).sort(),
    ['defaultHandlers', 'toEstree'],
    'should expose the public api'
  )

  assert.throws(
    () => {
      // @ts-expect-error: runtime.
      toEstree({})
    },
    /Cannot handle value `\[object Object]`/,
    'should crash on a non-node'
  )

  assert.throws(
    () => {
      // @ts-expect-error: runtime.
      toEstree({type: 'unknown'})
    },
    /Cannot handle unknown node `unknown`/,
    'should crash on an unknown node'
  )

  assert.deepEqual(
    toEstree(h('div')),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXElement',
            openingElement: {
              type: 'JSXOpeningElement',
              attributes: [],
              name: {type: 'JSXIdentifier', name: 'div'},
              selfClosing: true
            },
            closingElement: null,
            children: []
          }
        }
      ],
      sourceType: 'module',
      comments: []
    },
    'should transform an empty element'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {},
      children: [],
      position: {
        start: {line: 1, column: 1, offset: 0},
        end: {line: 1, column: 5, offset: 4}
      }
    }),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXElement',
            openingElement: {
              type: 'JSXOpeningElement',
              attributes: [],
              name: {type: 'JSXIdentifier', name: 'x'},
              selfClosing: true
            },
            closingElement: null,
            children: [],
            start: 0,
            end: 4,
            loc: {start: {line: 1, column: 0}, end: {line: 1, column: 4}},
            range: [0, 4]
          },
          start: 0,
          end: 4,
          loc: {start: {line: 1, column: 0}, end: {line: 1, column: 4}},
          range: [0, 4]
        }
      ],
      sourceType: 'module',
      start: 0,
      end: 4,
      loc: {start: {line: 1, column: 0}, end: {line: 1, column: 4}},
      range: [0, 4],
      comments: []
    },
    'should support position info when defined'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {},
      children: [],
      data: {a: 1, b: null, c: undefined}
    }),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXElement',
            openingElement: {
              type: 'JSXOpeningElement',
              attributes: [],
              name: {type: 'JSXIdentifier', name: 'x'},
              selfClosing: true
            },
            closingElement: null,
            children: [],
            data: {a: 1, b: null, c: undefined}
          }
        }
      ],
      sourceType: 'module',
      comments: []
    },
    'should support data when defined'
  )

  assert.deepEqual(
    toEstree(h('div')),
    acornClean(acornParse('<div/>')),
    'should match acorn'
  )

  assert.deepEqual(
    toEstree({type: 'root', children: [h('div')]}),
    acornClean(acornParse('<><div/></>')),
    'should support a root'
  )

  assert.deepEqual(
    toEstree({type: 'root', children: []}),
    acornClean(acornParse('<></>')),
    'should support an empty root'
  )

  assert.deepEqual(
    // @ts-expect-error: runtime.
    toEstree({type: 'root'}),
    acornClean(acornParse('<></>')),
    'should support a root w/o `chuldren`'
  )

  assert.deepEqual(
    toEstree({type: 'root', children: [{type: 'doctype', name: 'html'}]}),
    acornClean(acornParse('<></>')),
    'should ignore a doctype'
  )

  assert.deepEqual(
    toEstree({type: 'doctype', name: 'html'}),
    {type: 'Program', body: [], sourceType: 'module', comments: []},
    'should ignore *just* a doctype'
  )

  assert.deepEqual(
    toEstree({type: 'root', children: [{type: 'text', value: 'a'}]}),
    acornClean(acornParse('<>{"a"}</>')),
    'should support a text'
  )

  assert.deepEqual(
    toEstree({type: 'text', value: 'a'}),
    acornClean(acornParse('<>{"a"}</>')),
    'should support *just* a text'
  )

  assert.deepEqual(
    // @ts-expect-error: runtime.
    toEstree({type: 'root', children: [{type: 'text'}]}),
    acornClean(acornParse('<></>')),
    'should support a text w/o `value`'
  )

  assert.deepEqual(
    toEstree({type: 'root', children: [{type: 'comment', value: 'x'}]}),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXFragment',
            openingFragment: {type: 'JSXOpeningFragment'},
            closingFragment: {type: 'JSXClosingFragment'},
            children: [
              {
                type: 'JSXExpressionContainer',
                expression: {
                  type: 'JSXEmptyExpression',
                  comments: [
                    {type: 'Block', value: 'x', leading: false, trailing: true}
                  ]
                }
              }
            ]
          }
        }
      ],
      sourceType: 'module',
      comments: [{type: 'Block', value: 'x'}]
    },
    'should support a comment'
  )

  assert.deepEqual(
    toEstree(h('a', {x: true})),
    acornClean(acornParse('<a x/>')),
    'should support an attribute (boolean)'
  )

  assert.deepEqual(
    toEstree(h('a', {x: 'y'})),
    acornClean(acornParse('<a x="y"/>')),
    'should support an attribute (value)'
  )

  assert.deepEqual(
    toEstree(h('a', {style: 'width:1px'})),
    acornClean(acornParse('<a style={{width:"1px"}}/>')),
    'should support an attribute (style)'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      // @ts-expect-error: runtime.
      properties: {style: {width: 1}}
    }),
    acornClean(acornParse('<a style={{width:"1"}}/>')),
    'should support an attribute (style, as object)'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {
        style: {
          // @ts-expect-error: incorrect hast.
          WebkitBoxShadow: '0 0 1px 0 tomato',
          msBoxShadow: '0 0 1px 0 tomato',
          boxShadow: '0 0 1px 0 tomato'
        }
      }
    }),
    acornClean(
      acornParse(
        '<a style={{WebkitBoxShadow: "0 0 1px 0 tomato", msBoxShadow: "0 0 1px 0 tomato", boxShadow: "0 0 1px 0 tomato"}}/>'
      )
    ),
    'should support an attribute (style, as object, prefixes)'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {
        style:
          '-webkit-box-shadow: 0 0 1px 0 tomato; -ms-box-shadow: 0 0 1px 0 tomato; box-shadow: 0 0 1px 0 tomato'
      },
      children: []
    }),
    acornClean(
      acornParse(
        '<a style={{WebkitBoxShadow: "0 0 1px 0 tomato", msBoxShadow: "0 0 1px 0 tomato", boxShadow: "0 0 1px 0 tomato"}}/>'
      )
    ),
    'should support an attribute (style, string, prefixes)'
  )

  assert.throws(
    () => {
      toEstree(h('a', {style: 'x'}))
    },
    /a\[style]:1:2: property missing ':'/,
    'should crash on an incorrect style string'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {1: true},
      children: []
    }),
    acornClean(acornParse('<a {...{"1": true}} />')),
    'should support a non-identifier as a property (1)'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {'b+': 'c'},
      children: []
    }),
    acornClean(acornParse('<a {...{"b+": "c"}} />')),
    'should support a non-identifier as a property (2)'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {'b-c': 'd'},
      children: []
    }),
    acornClean(acornParse('<a b-c="d" />')),
    'should support a non-identifier as a property (3)'
  )

  assert.deepEqual(
    toEstree(h('a', [h('b')])),
    acornClean(acornParse('<a><b/></a>')),
    'should support a child'
  )

  assert.deepEqual(
    toEstree(h('a', ['\n', h('b'), '\n'])),
    acornClean(acornParse('<a>{"\\n"}<b/>{"\\n"}</a>')),
    'should support inter-element whitespace'
  )

  assert.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {}, children: []}),
    acornClean(acornParse('<x/>')),
    'should support an element w/o `children`'
  )

  assert.deepEqual(
    toEstree({type: 'element', tagName: 'xYx', properties: {}, children: []}),
    acornClean(acornParse('<xYx/>')),
    'should support an element w/ casing in the `tagName`'
  )

  assert.deepEqual(
    toEstree({type: 'element', tagName: 'x', children: []}),
    acornClean(acornParse('<x/>')),
    'should support an element w/o `properties`'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {y: null},
      children: []
    }),
    acornClean(acornParse('<x/>')),
    'should ignore a `null` prop'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {y: undefined},
      children: []
    }),
    acornClean(acornParse('<x/>')),
    'should ignore an `undefined` prop'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {y: Number.NaN},
      children: []
    }),
    acornClean(acornParse('<x/>')),
    'should ignore an `NaN` prop'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {allowFullScreen: 0},
      children: []
    }),
    acornClean(acornParse('<x/>')),
    'should ignore a falsey boolean prop'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {className: ['y', 'z']},
      children: []
    }),
    acornClean(acornParse('<x className="y z"/>')),
    'should support space-separated lists'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {accept: ['y', 'z']},
      children: []
    }),
    acornClean(acornParse('<x accept="y, z"/>')),
    'should support comma-separated lists'
  )

  assert.deepEqual(
    toEstree(s('svg', {viewBox: '0 0 1 1'})),
    acornClean(acornParse('<svg viewBox="0 0 1 1"/>')),
    'should support SVG'
  )

  assert.deepEqual(
    toEstree(s('x', {g1: [1, 2]})),
    acornClean(acornParse('<x g1="1 2"/>')),
    'should support SVG w/ an explicit `space` (check)'
  )

  assert.deepEqual(
    toEstree(s('x', {g1: [1, 2]}), {space: 'svg'}),
    acornClean(acornParse('<x g1="1, 2"/>')),
    'should support SVG w/ an explicit `space`'
  )

  assert.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'p',
      children: [
        {
          type: 'element',
          tagName: 'b',
          children: [{type: 'text', value: 'a'}]
        },
        {type: 'text', value: ' '},
        {
          type: 'element',
          tagName: 'i',
          children: [{type: 'text', value: 'b'}]
        },
        {type: 'text', value: '.'}
      ]
    }),
    acornClean(acornParse('<p><b>{"a"}</b>{" "}<i>{"b"}</i>{"."}</p>')),
    'should support whitespace between elements'
  )

  assert.deepEqual(
    // @ts-expect-error: runtime.
    toEstree({type: 'mdxJsxTextElement'}),
    acornClean(acornParse('<></>')),
    'should support an custom `mdxJsxTextElement` node w/o name, attributes, or children'
  )

  assert.deepEqual(
    toEstree(
      {
        type: 'root',
        // @ts-expect-error: custom node.
        children: [{type: 'array', value: 'comma,seperated,array'}]
      },
      {
        handlers: {
          array(/** @type {{type: 'array', value: string}} */ node) {
            const elements = node.value
              .split(',')
              .map((value) => ({type: 'Literal', value}))
            return elements
          }
        }
      }
    ),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXFragment',
            openingFragment: {type: 'JSXOpeningFragment'},
            closingFragment: {type: 'JSXClosingFragment'},
            children: [
              {type: 'Literal', value: 'comma'},
              {type: 'Literal', value: 'seperated'},
              {type: 'Literal', value: 'array'}
            ]
          }
        }
      ],
      sourceType: 'module',
      comments: []
    },
    'should support custom handler that returns an array'
  )

  assert.deepEqual(
    toEstree(
      h('table', [
        {type: 'text', value: '\n'},
        h('tr'),
        {type: 'text', value: '\n'}
      ])
    ),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXElement',
            openingElement: {
              type: 'JSXOpeningElement',
              attributes: [],
              name: {type: 'JSXIdentifier', name: 'table'},
              selfClosing: false
            },
            closingElement: {
              type: 'JSXClosingElement',
              name: {type: 'JSXIdentifier', name: 'table'}
            },
            children: [
              {
                type: 'JSXElement',
                openingElement: {
                  type: 'JSXOpeningElement',
                  attributes: [],
                  name: {type: 'JSXIdentifier', name: 'tr'},
                  selfClosing: true
                },
                closingElement: null,
                children: []
              }
            ]
          }
        }
      ],
      sourceType: 'module',
      comments: []
    },
    'should ignore text line endings between table elements'
  )
})

test('integration (babel)', () => {
  assert.deepEqual(
    generate(toBabel(toEstree(h('x')))).code,
    '<x />;',
    'should format an element (void)'
  )

  assert.deepEqual(
    generate(toBabel(toEstree(h('x', 'y')))).code,
    '<x>{"y"}</x>;',
    'should format an element w/ text child'
  )

  assert.deepEqual(
    generate(toBabel(toEstree(h('x', h('y', 'z'))))).code,
    '<x><y>{"z"}</y></x>;',
    'should format an element w/ element child'
  )

  assert.deepEqual(
    generate(toBabel(toEstree(h('x', {y: true, x: 'a'})))).code,
    '<x y x="a" />;',
    'should format an element w/ props'
  )

  assert.deepEqual(
    generate(toBabel(toEstree(h('x', {style: 'a:b'})))).code,
    '<x style={{\n  a: "b"\n}} />;',
    'should format an element w/ style props'
  )

  assert.deepEqual(
    generate(toBabel(toEstree(h('x', [{type: 'comment', value: 'y'}])))).code,
    '<x>{/*y*/}</x>;',
    'should format a comment'
  )

  assert.deepEqual(
    generate(toBabel(toEstree({type: 'root', children: []}))).code,
    '<></>;',
    'should format a root'
  )

  assert.deepEqual(
    generate(
      toBabel(
        toEstree({
          type: 'root',
          children: [
            {type: 'text', value: ' '},
            {type: 'text', value: 'x'},
            {type: 'text', value: ' '},
            {type: 'text', value: 'y'},
            {type: 'text', value: ' '}
          ]
        })
      )
    ).code,
    '<>{"x"}{" "}{"y"}</>;',
    'should ignore initial and trailing whitespace in a root'
  )

  assert.deepEqual(
    generate(toBabel(toEstree(s('svg', {viewBox: '0 0 1 1'})))).code,
    '<svg viewBox="0 0 1 1" />;',
    'should format svg'
  )
})

test('integration (micromark-extension-mdxjs, mdast-util-mdx)', () => {
  assert.deepEqual(
    transform('## Hello, {props}!'),
    '<><h2>{"Hello, "}{props}{"!"}</h2></>;\n',
    'should transform an MDX.js expression (text)'
  )

  assert.deepEqual(
    transform('{1 + 1}'),
    '<>{1 + 1}</>;\n',
    'should transform an MDX.js expression (flow)'
  )

  assert.deepEqual(
    transform('## Hello, {/* x */}!'),
    '<><h2>{"Hello, "}{}{"!"}</h2></>;\n',
    'should transform an empty MDX.js expression'
  )

  assert.deepEqual(
    transform('{a + /* 1 */ 2}'),
    '<>{a + 2}</>;\n',
    'should transform comments in an MDX expression'
  )

  assert.deepEqual(
    transform('## Hello, <x />'),
    '<><h2>{"Hello, "}<x /></h2></>;\n',
    'should transform a void MDX.js JSX element (text)'
  )

  assert.deepEqual(
    transform('## Hello, <x y z="a" />'),
    '<><h2>{"Hello, "}<x y z="a" /></h2></>;\n',
    'should transform boolean and literal attributes on JSX elements'
  )

  assert.deepEqual(
    transform('## Hello, <x y={1 + 1} />'),
    '<><h2>{"Hello, "}<x y={1 + 1} /></h2></>;\n',
    'should transform attribute value expressions on JSX elements'
  )

  assert.throws(
    () => {
      transform('<x y={/* x */} />')
    },
    /Unexpected empty expression/,
    'should crash on empty attribute value expressions'
  )

  assert.deepEqual(
    transform('<a b={1 + /* 1 */ 2} />'),
    '<><a b={1 + 2} /></>;\n',
    'should transform comments in an MDX attribute value expression'
  )

  assert.deepEqual(
    transform('<x style={{color: "red"}} />'),
    '<><x style={{\n  color: "red"\n}} /></>;\n',
    'should transform object attribute value expressions'
  )

  assert.deepEqual(
    transform('## Hello, <x a={b} />', true),
    '<><h2>{"Hello, "}<x a={} /></h2></>;\n',
    'should transform attribute value expressions w/o estrees'
  )

  assert.deepEqual(
    transform('## Hello, <x {...props} />'),
    '<><h2>{"Hello, "}<x {...props} /></h2></>;\n',
    'should transform attribute expressions on JSX elements'
  )

  assert.deepEqual(
    transform('<a {...{c: /* 1 */ 1, d: 2 /* 2 */}} />'),
    '<><a {...{\n  /*2*/\n  c: 1,\n  d: 2\n}} /></>;\n',
    'should transform comments in an MDX attribute expressions'
  )

  assert.deepEqual(
    transform('## Hello, <x {...props} />', true),
    '<><h2>{"Hello, "}<x {...{}} /></h2></>;\n',
    'should transform attribute expressions w/o estrees'
  )

  assert.deepEqual(
    transform('<a.b.c d>e</a.b.c>'),
    '<><p><a.b.c d>{"e"}</a.b.c></p></>;\n',
    'should support member names'
  )

  assert.deepEqual(
    transform('<a:b d>e</a:b>'),
    '<><p><a:b d>{"e"}</a:b></p></>;\n',
    'should support namespace names'
  )

  assert.deepEqual(
    transform('<x xml:lang="en" />'),
    '<><x xml:lang="en" /></>;\n',
    'should support namespace attribute names'
  )

  assert.deepEqual(
    transform('<x>\n  - y\n</x>'),
    '<><x><ul>{"\\n"}<li>{"y"}</li>{"\\n"}</ul></x></>;\n',
    'should transform children in MDX.js elements'
  )

  assert.deepEqual(
    transform('## Hello, <>{props}</>!'),
    '<><h2>{"Hello, "}<>{props}</>{"!"}</h2></>;\n',
    'should transform MDX.js JSX fragments'
  )

  assert.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    'import x from "y";\nexport const name = "World";\n<><h2>{"Hello, "}{name}{"!"}</h2></>;\n',
    'should transform MDX.js ESM'
  )

  assert.deepEqual(
    transform(
      'import /* 1 */ name /* 2 */ from /* 3 */ "a" /* 4 */\n\n\n## Hello, {name}!'
    ),
    'import name from "a";\n<><h2>{"Hello, "}{name}{"!"}</h2></>;\n',
    'should transform comments in MDX.js ESM'
  )

  assert.deepEqual(
    transform('import x from "y"\nexport const name = "World"'),
    'import x from "y";\nexport const name = "World";\n<></>;\n',
    'should transform *just* MDX.js ESM'
  )

  assert.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!',
      true
    ),
    '<><h2>{"Hello, "}{}{"!"}</h2></>;\n',
    'should transform ESM w/o estrees'
  )

  assert.deepEqual(
    transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
    '<><svg viewBox="0 0 1 1"><rect /></svg></>;\n',
    'should support svg'
  )

  assert.deepEqual(
    transform(''),
    '<></>;\n',
    'should support an empty document'
  )

  /**
   * @param {string} doc
   * @param {boolean} [clean=false]
   */
  function transform(doc, clean) {
    const mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()]
    })

    const hast = toHast(mdast, {passThrough})

    // @ts-expect-error: hush.
    if (clean && hast) visit(hast, passThrough, acornClean)

    // @ts-expect-error: it’s a node.
    const program = toEstree(hast)
    attachComments(program, program.comments)
    delete program.comments

    return toJs(program, {handlers: jsx}).value

    /**
     * @param {HastNode} node
     */
    function acornClean(node) {
      let index = -1

      if (node.data && node.data.estree) delete node.data.estree

      // @ts-expect-error embedded mdx
      if (typeof node.value === 'object') acornClean(node.value)

      // @ts-expect-error embedded mdx
      if (node.attributes) {
        // @ts-expect-error embedded mdx
        while (++index < node.attributes.length) {
          // @ts-expect-error embedded mdx
          acornClean(node.attributes[index])
        }
      }
    }
  }
})

test('integration (@babel/plugin-transform-react-jsx, react)', () => {
  assert.deepEqual(
    transform('## Hello, world!'),
    '/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Hello, world!"));',
    'should integrate w/ `@babel/plugin-transform-react-jsx`'
  )

  assert.deepEqual(
    transform('<x y className="a" {...z} />!'),
    [
      'function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }',
      '/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", null, /*#__PURE__*/React.createElement("x", _extends({',
      '  y: true,',
      '  className: "a"',
      '}, z)), "!"));'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX JSX)'
  )

  assert.deepEqual(
    transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
    [
      '/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("svg", {',
      '  viewBox: "0 0 1 1"',
      '}, /*#__PURE__*/React.createElement("rect", null)));'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX JSX, SVG)'
  )

  assert.deepEqual(
    transform('Sum: {1 + 1}.'),
    '/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", null, "Sum: ", 1 + 1, "."));',
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX expression)'
  )

  assert.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    [
      'import x from "y";',
      'export const name = "World";',
      '/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Hello, ", name, "!"));'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX.js ESM)'
  )

  assert.deepEqual(
    transform('# Hi <Icon /> {"!"}', {runtime: 'automatic'}),
    [
      'import { Fragment as _Fragment } from "react/jsx-runtime";',
      'import { jsx as _jsx } from "react/jsx-runtime";',
      'import { jsxs as _jsxs } from "react/jsx-runtime";',
      '/*#__PURE__*/_jsx(_Fragment, {',
      '  children: /*#__PURE__*/_jsxs("h1", {',
      '    children: ["Hi ", /*#__PURE__*/_jsx(Icon, {}), " ", "!"]',
      '  })',
      '});'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (runtime: automatic)'
  )

  assert.deepEqual(
    transform('# Hi <Icon /> {"!"}', {pragma: 'a', pragmaFrag: 'b'}),
    'a("b", null, a("h1", null, "Hi ", a(Icon, null), " ", "!"));',
    'should integrate w/ `@babel/plugin-transform-react-jsx` (pragma, pragmaFrag)'
  )

  assert.deepEqual(
    transform(
      'import /* a */ a from "b"\n\n# {/* b*/} <x {...{/* c */}} d={/* d*/e} />',
      {runtime: 'automatic'}
    ),
    [
      'import /* a */a from "b";',
      'import { Fragment as _Fragment } from "react/jsx-runtime";',
      'import { jsx as _jsx } from "react/jsx-runtime";',
      'import { jsxs as _jsxs } from "react/jsx-runtime";',
      '/*#__PURE__*/_jsx(_Fragment, {',
      '  children: /*#__PURE__*/_jsxs("h1", {',
      '    children: [" ", /*#__PURE__*/_jsx("x", {',
      '      d: e',
      '    })]',
      '  })',
      '});'
    ].join('\n'),
    'should support comments when integrating w/ `@babel/plugin-transform-react-jsx`'
  )

  /**
   * @param {string} doc
   * @param {unknown} [transformReactOptions]
   * @returns {string}
   */
  function transform(doc, transformReactOptions) {
    const mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()]
    })

    const hast = toHast(mdast, {passThrough})

    // @ts-expect-error: update.
    return babel.transformFromAstSync(toBabel(toEstree(hast)), null, {
      babelrc: false,
      configFile: false,
      plugins: [['@babel/plugin-transform-react-jsx', transformReactOptions]]
    }).code
  }
})

test('integration (@vue/babel-plugin-jsx, Vue 3)', () => {
  assert.deepEqual(
    transform('## Hello, world!'),
    'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";\n_createVNode(_Fragment, null, [_createVNode("h2", null, ["Hello, world!"])]);',
    'should integrate w/ `@vue/babel-plugin-jsx`'
  )

  assert.deepEqual(
    transform('<x y className="a" {...z} />!'),
    [
      'import { createVNode as _createVNode, mergeProps as _mergeProps, resolveComponent as _resolveComponent, Fragment as _Fragment } from "vue";',
      '_createVNode(_Fragment, null, [_createVNode("p", null, [_createVNode(_resolveComponent("x"), _mergeProps({',
      '  "y": true,',
      '  "className": "a"',
      '}, z), null), "!"])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX JSX)'
  )

  assert.deepEqual(
    transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
    [
      'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";',
      '_createVNode(_Fragment, null, [_createVNode("svg", {',
      '  "viewBox": "0 0 1 1"',
      '}, [_createVNode("rect", null, null)])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX JSX, SVG)'
  )

  assert.deepEqual(
    transform('Sum: {1 + 1}.'),
    'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";\n_createVNode(_Fragment, null, [_createVNode("p", null, ["Sum: ", 1 + 1, "."])]);',
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX expression)'
  )

  assert.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    [
      'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";',
      'import x from "y";',
      'export const name = "World";',
      '_createVNode(_Fragment, null, [_createVNode("h2", null, ["Hello, ", name, "!"])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX.js ESM)'
  )

  assert.deepEqual(
    transform(
      'import /* a */ a from "b"\n\n# {/* b*/} <x {...{/* c */}} d={/* d*/e} />'
    ),
    [
      'import { createVNode as _createVNode, mergeProps as _mergeProps, resolveComponent as _resolveComponent, Fragment as _Fragment } from "vue";',
      'import /* a */a from "b";',
      '_createVNode(_Fragment, null, [_createVNode("h1", null, [" ", _createVNode(_resolveComponent("x"), _mergeProps({}, {',
      '  "d": e',
      '}), null)])]);'
    ].join('\n'),
    'should support comments when integrating w/ `@babel/plugin-transform-react-jsx`'
  )

  /**
   * @param {string} doc
   * @returns {string}
   */
  function transform(doc) {
    const mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()]
    })

    const hast = toHast(mdast, {passThrough})

    // @ts-expect-error: update.
    return babel.transformFromAstSync(toBabel(toEstree(hast)), null, {
      babelrc: false,
      configFile: false,
      plugins: ['@vue/babel-plugin-jsx']
    }).code
  }
})

/**
 * @param {Program} node
 */
function acornClean(node) {
  node.sourceType = 'module'

  // @ts-expect-error acorn
  walk(node, {enter})

  return JSON.parse(JSON.stringify(node))

  /** @param {Node} node */
  function enter(node) {
    // @ts-expect-error esast
    delete node.position

    // See: <https://github.com/syntax-tree/esast-util-from-estree/issues/3>
    if (node.type === 'JSXOpeningFragment') {
      // @ts-expect-error acorn
      delete node.attributes
      // @ts-expect-error acorn
      delete node.selfClosing
    }
  }
}

/**
 * @param {string} doc
 * @returns {Program}
 */
function acornParse(doc) {
  const program = /** @type {Program} */ (
    fromJs(doc, {
      module: true,
      plugins: [acornJsx()]
    })
  )
  return program
}
