'use strict'

var test = require('tape')
var babel = require('@babel/core')
var generate = require('@babel/generator').default
var acorn = require('acorn')
var jsx = require('acorn-jsx')
var toBabel = require('estree-to-babel')
var {walk} = require('estree-walker')
var h = require('hastscript')
var s = require('hastscript/svg')
var fromParse5 = require('hast-util-from-parse5')
var fromMarkdown = require('mdast-util-from-markdown')
var toHast = require('mdast-util-to-hast')
var mdxFromMarkdown = require('mdast-util-mdx').fromMarkdown
var mdxjs = require('micromark-extension-mdxjs')
var parse5 = require('parse5')
var recast = require('recast')
var visit = require('unist-util-visit')
var toEstree = require('.')

test('hast-util-to-estree', function (t) {
  t.throws(
    function () {
      toEstree({})
    },
    /Cannot handle value `\[object Object]`/,
    'should crash on a non-node'
  )

  t.throws(
    function () {
      toEstree({type: 'unknown'})
    },
    /Cannot handle unknown node `unknown`/,
    'should crash on an unknown node'
  )

  t.deepEqual(
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

  t.deepEqual(
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

  t.deepEqual(
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

  t.deepEqual(
    toEstree(h('div')),
    acornClean(acornParse('<div/>')),
    'should match acorn'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [h('div')]}),
    acornClean(acornParse('<><div/></>')),
    'should support a root'
  )

  t.deepEqual(
    toEstree({type: 'root', children: []}),
    acornClean(acornParse('<></>')),
    'should support an empty root'
  )

  t.deepEqual(
    toEstree({type: 'root'}),
    acornClean(acornParse('<></>')),
    'should support a root w/o `chuldren`'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'doctype', name: 'html'}]}),
    acornClean(acornParse('<></>')),
    'should ignore a doctype'
  )

  t.deepEqual(
    toEstree({type: 'doctype', name: 'html'}),
    {type: 'Program', body: [], sourceType: 'module', comments: []},
    'should ignore *just* a doctype'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'text', value: 'a'}]}),
    acornClean(acornParse('<>{"a"}</>')),
    'should support a text'
  )

  t.deepEqual(
    toEstree({type: 'text', value: 'a'}),
    acornClean(acornParse('<>{"a"}</>')),
    'should support *just* a text'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'text'}]}),
    acornClean(acornParse('<></>')),
    'should support a text w/o `value`'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'comment', value: 'x'}]}),
    {
      type: 'Program',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'JSXFragment',
            openingFragment: {
              type: 'JSXOpeningFragment',
              attributes: [],
              selfClosing: false
            },
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

  t.deepEqual(
    toEstree(h('a', {x: true})),
    acornClean(acornParse('<a x/>')),
    'should support an attribute (boolean)'
  )

  t.deepEqual(
    toEstree(h('a', {x: 'y'})),
    acornClean(acornParse('<a x="y"/>')),
    'should support an attribute (value)'
  )

  t.deepEqual(
    toEstree(h('a', {style: 'width:1px'})),
    acornClean(acornParse('<a style={{width:"1px"}}/>')),
    'should support an attribute (style)'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {style: {width: 1}}
    }),
    acornClean(acornParse('<a style={{width:"1"}}/>')),
    'should support an attribute (style, as object)'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {
        style: {
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

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {
        style:
          '-webkit-box-shadow: 0 0 1px 0 tomato; -ms-box-shadow: 0 0 1px 0 tomato; box-shadow: 0 0 1px 0 tomato'
      }
    }),
    acornClean(
      acornParse(
        '<a style={{WebkitBoxShadow: "0 0 1px 0 tomato", msBoxShadow: "0 0 1px 0 tomato", boxShadow: "0 0 1px 0 tomato"}}/>'
      )
    ),
    'should support an attribute (style, string, prefixes)'
  )

  t.throws(
    function () {
      toEstree(h('a', {style: 'x'}))
    },
    /a\[style]:1:2: property missing ':'/,
    'should crash on an incorrect style string'
  )

  t.deepEqual(
    toEstree(h('a', [h('b')])),
    acornClean(acornParse('<a><b/></a>')),
    'should support a child'
  )

  t.deepEqual(
    toEstree(h('a', ['\n', h('b'), '\n'])),
    acornClean(acornParse('<a>{"\\n"}<b/>{"\\n"}</a>')),
    'should support inter-element whitespace'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {}}),
    acornClean(acornParse('<x/>')),
    'should support an element w/o `children`'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'xYx', properties: {}}),
    acornClean(acornParse('<xYx/>')),
    'should support an element w/ casing in the `tagName`'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', children: []}),
    acornClean(acornParse('<x/>')),
    'should support an element w/o `properties`'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {y: null}}),
    acornClean(acornParse('<x/>')),
    'should ignore a `null` prop'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {y: undefined}}),
    acornClean(acornParse('<x/>')),
    'should ignore an `undefined` prop'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {y: NaN}}),
    acornClean(acornParse('<x/>')),
    'should ignore an `NaN` prop'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {allowFullScreen: 0}}),
    acornClean(acornParse('<x/>')),
    'should ignore a falsey boolean prop'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {className: ['y', 'z']}
    }),
    acornClean(acornParse('<x className="y z"/>')),
    'should support space-separated lists'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {srcSet: ['y', 'z']}
    }),
    acornClean(acornParse('<x srcSet="y, z"/>')),
    'should support comma-separated lists'
  )

  t.deepEqual(
    toEstree(s('svg', {viewBox: '0 0 1 1'})),
    acornClean(acornParse('<svg viewBox="0 0 1 1"/>')),
    'should support SVG'
  )

  t.deepEqual(
    toEstree(s('x', {g1: [1, 2]})),
    acornClean(acornParse('<x g1="1 2"/>')),
    'should support SVG w/ an explicit `space` (check)'
  )

  t.deepEqual(
    toEstree(s('x', {g1: [1, 2]}), {space: 'svg'}),
    acornClean(acornParse('<x g1="1, 2"/>')),
    'should support SVG w/ an explicit `space`'
  )

  t.deepEqual(
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

  t.deepEqual(
    toEstree({type: 'mdxJsxTextElement'}),
    acornClean(acornParse('<></>')),
    'should support an custom `mdxJsxTextElement` node w/o name, attributes, or children'
  )

  t.end()
})

test('integration (recast)', function (t) {
  t.deepEqual(
    recastSerialize(toEstree(h('x'))),
    '<x />;',
    'should format an element (void)'
  )

  t.deepEqual(
    recastSerialize(toEstree(h('x', 'y'))),
    '<x>{"y"}</x>;',
    'should format an element w/ text child'
  )

  t.deepEqual(
    recastSerialize(toEstree(h('x', h('y', 'z')))),
    '<x><y>{"z"}</y></x>;',
    'should format an element w/ element child'
  )

  t.deepEqual(
    recastSerialize(toEstree(h('x', {y: true, x: 'a'}))),
    '<x y x="a" />;',
    'should format an element w/ props'
  )

  t.deepEqual(
    recastSerialize(toEstree(h('x', {style: 'a:b'}))),
    '<x\n    style={{\n        a: "b"\n    }} />;',
    'should format an element w/ style props'
  )

  t.deepEqual(
    recastSerialize(toEstree(h('x', [{type: 'comment', value: 'y'}]))),
    '<x>{/*y*/}</x>;',
    'should format a comment'
  )

  t.deepEqual(
    recastSerialize(toEstree(h('x', [{type: 'comment', value: 'y'}]))),
    '<x>{/*y*/}</x>;',
    'should format a comment'
  )

  t.deepEqual(
    recastSerialize(toEstree({type: 'comment', value: 'y'})),
    '<>{/*y*/}</>;',
    'should format just a comment'
  )

  var doc = '<!--a--><x><!--b--></x><!--c-->'
  t.deepEqual(
    recastSerialize(
      toEstree(
        fromParse5(
          parse5.parseFragment(doc, {sourceCodeLocationInfo: true}),
          doc
        )
      )
    ),
    '<>{/*a*/}<x>{/*b*/}</x>{/*c*/}</>;',
    'should format comments w/ positional info'
  )

  t.deepEqual(
    recastSerialize(toEstree({type: 'root', children: []})),
    '<></>;',
    'should format a root'
  )

  t.deepEqual(
    recastSerialize(toEstree(s('svg', {viewBox: '0 0 1 1'}))),
    '<svg viewBox="0 0 1 1" />;',
    'should format svg'
  )

  t.end()
})

test('integration (babel)', function (t) {
  t.deepEqual(
    generate(toBabel(toEstree(h('x')))).code,
    '<x />;',
    'should format an element (void)'
  )

  t.deepEqual(
    generate(toBabel(toEstree(h('x', 'y')))).code,
    '<x>{"y"}</x>;',
    'should format an element w/ text child'
  )

  t.deepEqual(
    generate(toBabel(toEstree(h('x', h('y', 'z'))))).code,
    '<x><y>{"z"}</y></x>;',
    'should format an element w/ element child'
  )

  t.deepEqual(
    generate(toBabel(toEstree(h('x', {y: true, x: 'a'})))).code,
    '<x y x="a" />;',
    'should format an element w/ props'
  )

  t.deepEqual(
    generate(toBabel(toEstree(h('x', {style: 'a:b'})))).code,
    '<x style={{\n  a: "b"\n}} />;',
    'should format an element w/ style props'
  )

  t.deepEqual(
    generate(toBabel(toEstree(h('x', [{type: 'comment', value: 'y'}])))).code,
    '<x>{\n  /*y*/\n  }</x>;',
    'should format a comment'
  )

  t.deepEqual(
    generate(toBabel(toEstree({type: 'root', children: []}))).code,
    '<></>;',
    'should format a root'
  )

  t.deepEqual(
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

  t.deepEqual(
    generate(toBabel(toEstree(s('svg', {viewBox: '0 0 1 1'})))).code,
    '<svg viewBox="0 0 1 1" />;',
    'should format svg'
  )

  t.end()
})

test('integration (micromark-extension-mdxjs, mdast-util-mdx)', function (t) {
  t.deepEqual(
    transform('## Hello, {props}!'),
    '<><h2>{"Hello, "}{props}{"!"}</h2></>;',
    'should transform an MDX.js expression (text)'
  )

  t.deepEqual(
    transform('{1 + 1}'),
    '<>{1 + 1}</>;',
    'should transform an MDX.js expression (flow)'
  )

  // Note: `recast` can’t serialize the sole comment.
  // It’s there in the AST though.
  t.deepEqual(
    transform('## Hello, {/* x */}!'),
    '<><h2>{"Hello, "}{}{"!"}</h2></>;',
    'should transform an empty MDX.js expression'
  )

  t.deepEqual(
    transform('{a + /* 1 */ 2}'),
    '<>{a + /* 1 */\n    2}</>;',
    'should transform comments in an MDX expression'
  )

  t.deepEqual(
    transform('## Hello, <x />'),
    '<><h2>{"Hello, "}<x /></h2></>;',
    'should transform a void MDX.js JSX element (text)'
  )

  t.deepEqual(
    transform('## Hello, <x y z="a" />'),
    '<><h2>{"Hello, "}<x y z="a" /></h2></>;',
    'should transform boolean and literal attributes on JSX elements'
  )

  t.deepEqual(
    transform('## Hello, <x y={1 + 1} />'),
    '<><h2>{"Hello, "}<x y={1 + 1} /></h2></>;',
    'should transform attribute value expressions on JSX elements'
  )

  t.deepEqual(
    transform('<x y={/* x */} />'),
    '<><x y={} /></>;',
    'should transform empty attribute value expressions'
  )

  t.deepEqual(
    transform('<a b={1 + /* 1 */ 2} />'),
    '<><a\n        b={1 + /* 1 */\n        2} /></>;',
    'should transform comments in an MDX attribute value expression'
  )

  t.deepEqual(
    transform('<x style={{color: "red"}} />'),
    '<><x\n        style={{\n            color: "red"\n        }} /></>;',
    'should transform object attribute value expressions'
  )

  t.deepEqual(
    transform('## Hello, <x a={b} />', true),
    '<><h2>{"Hello, "}<x a={} /></h2></>;',
    'should transform attribute value expressions w/o estrees'
  )

  t.deepEqual(
    transform('## Hello, <x {...props} />'),
    '<><h2>{"Hello, "}<x {...props} /></h2></>;',
    'should transform attribute expressions on JSX elements'
  )

  t.deepEqual(
    transform('<a {...{c: /* 1 */ 1, d: 2 /* 2 */}} />'),
    '<><a\n        {...{\n            c: /* 1 */\n            1,\n\n            d: 2\n        }/* 2 */} /></>;',
    'should transform comments in an MDX attribute expressions'
  )

  t.deepEqual(
    transform('## Hello, <x {...props} />', true),
    '<><h2>{"Hello, "}<x\n            {...{\n\n            }} /></h2></>;',
    'should transform attribute expressions w/o estrees'
  )

  t.deepEqual(
    transform('<a.b.c d>e</a.b.c>'),
    '<><p><a.b.c d>{"e"}</a.b.c></p></>;',
    'should support member names'
  )

  t.deepEqual(
    transform('<a:b d>e</a:b>'),
    '<><p><a:b d>{"e"}</a:b></p></>;',
    'should support namespace names'
  )

  t.deepEqual(
    transform('<x xml:lang="en" />'),
    '<><x xml:lang="en" /></>;',
    'should support namespace attribute names'
  )

  t.deepEqual(
    transform('<x>\n  - y\n</x>'),
    '<><x><ul>{"\\n"}<li>{"y"}</li>{"\\n"}</ul></x></>;',
    'should transform children in MDX.js elements'
  )

  t.deepEqual(
    transform('## Hello, <>{props}</>!'),
    '<><h2>{"Hello, "}<>{props}</>{"!"}</h2></>;',
    'should transform MDX.js JSX fragments'
  )

  t.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    'import x from "y";\nexport const name = "World";\n<><h2>{"Hello, "}{name}{"!"}</h2></>;',
    'should transform MDX.js ESM'
  )

  t.deepEqual(
    transform(
      'import /* 1 */ name /* 2 */ from /* 3 */ "a" /* 4 */\n\n\n## Hello, {name}!'
    ),
    'import /* 1 */\nname from /* 2 */\n/* 3 */\n"a";\n\n<><h2>{"Hello, "}{name}{"!"}</h2></>;',
    'should transform comments in MDX.js ESM'
  )

  t.deepEqual(
    transform('import x from "y"\nexport const name = "World"'),
    'import x from "y";\nexport const name = "World";\n<></>;',
    'should transform *just* MDX.js ESM'
  )

  t.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!',
      true
    ),
    '<><h2>{"Hello, "}{}{"!"}</h2></>;',
    'should transform ESM w/o estrees'
  )

  t.deepEqual(
    transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
    '<><svg viewBox="0 0 1 1"><rect /></svg></>;',
    'should support svg'
  )

  t.deepEqual(transform(''), '<></>;', 'should support an empty document')

  t.end()

  function transform(doc, clean) {
    var mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown]
    })
    var types = [
      'mdxFlowExpression',
      'mdxJsxFlowElement',
      'mdxJsxTextElement',
      'mdxTextExpression',
      'mdxjsEsm'
    ]

    var hast = toHast(mdast, {passThrough: types})

    if (clean) {
      visit(hast, types, acornClean)
    }

    return recastSerialize(toEstree(hast))

    function acornClean(node) {
      if (node.data && node.data.estree) {
        delete node.data.estree
      }

      if (typeof node.value === 'object') {
        acornClean(node.value)
      }

      if (node.attributes) {
        node.attributes.forEach(acornClean)
      }
    }
  }
})

test('integration (@babel/plugin-transform-react-jsx, react)', function (t) {
  t.deepEqual(
    transform('## Hello, world!'),
    '/*#__PURE__*/\nReact.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Hello, world!"));',
    'should integrate w/ `@babel/plugin-transform-react-jsx`'
  )

  t.deepEqual(
    transform('<x y className="a" {...z} />!'),
    [
      'function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }',
      '',
      '/*#__PURE__*/',
      'React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", null, /*#__PURE__*/React.createElement("x", _extends({',
      '  y: true,',
      '  className: "a"',
      '}, z)), "!"));'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX JSX)'
  )

  t.deepEqual(
    transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
    [
      '/*#__PURE__*/',
      'React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("svg", {',
      '  viewBox: "0 0 1 1"',
      '}, /*#__PURE__*/React.createElement("rect", null)));'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX JSX, SVG)'
  )

  t.deepEqual(
    transform('Sum: {1 + 1}.'),
    '/*#__PURE__*/\nReact.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", null, "Sum: ", 1 + 1, "."));',
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX expression)'
  )

  t.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    [
      'import x from "y";',
      'export const name = "World";',
      '',
      '/*#__PURE__*/',
      'React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Hello, ", name, "!"));'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (MDX.js ESM)'
  )

  t.deepEqual(
    transform('# Hi <Icon /> {"!"}', {runtime: 'automatic'}),
    [
      'import { jsx as _jsx } from "react/jsx-runtime";',
      'import { jsxs as _jsxs } from "react/jsx-runtime";',
      'import { Fragment as _Fragment } from "react/jsx-runtime";',
      '',
      '/*#__PURE__*/',
      '_jsx(_Fragment, {',
      '  children: /*#__PURE__*/_jsxs("h1", {',
      '    children: ["Hi ", /*#__PURE__*/_jsx(Icon, {}), " ", "!"]',
      '  })',
      '});'
    ].join('\n'),
    'should integrate w/ `@babel/plugin-transform-react-jsx` (runtime: automatic)'
  )

  t.deepEqual(
    transform('# Hi <Icon /> {"!"}', {pragma: 'a', pragmaFrag: 'b'}),
    'a(b, null, a("h1", null, "Hi ", a(Icon, null), " ", "!"));',
    'should integrate w/ `@babel/plugin-transform-react-jsx` (pragma, pragmaFrag)'
  )

  t.deepEqual(
    transform(
      'import /* a */ a from "b"\n\n# {/* b*/} <x {...{/* c */}} d={/* d*/e} />',
      {runtime: 'automatic'}
    ),
    [
      'import',
      '/* a */',
      'a from "b";',
      'import { jsx as _jsx } from "react/jsx-runtime";',
      'import { jsxs as _jsxs } from "react/jsx-runtime";',
      'import { Fragment as _Fragment } from "react/jsx-runtime";',
      '',
      '/*#__PURE__*/',
      '_jsx(_Fragment, {',
      '  children: /*#__PURE__*/_jsxs("h1", {',
      '    children: [" ", /*#__PURE__*/_jsx("x", {',
      '      d: e',
      '    })]',
      '  })',
      '});'
    ].join('\n'),
    'should support comments when integrating w/ `@babel/plugin-transform-react-jsx`'
  )

  t.end()

  function transform(doc, transformReactOptions) {
    var mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown]
    })

    var hast = toHast(mdast, {
      passThrough: [
        'mdxFlowExpression',
        'mdxJsxFlowElement',
        'mdxJsxTextElement',
        'mdxTextExpression',
        'mdxjsEsm'
      ]
    })

    return babel.transformFromAstSync(toBabel(toEstree(hast)), null, {
      babelrc: false,
      configFile: false,
      plugins: [['@babel/plugin-transform-react-jsx', transformReactOptions]]
    }).code
  }
})

test('integration (@vue/babel-plugin-jsx, Vue 3)', function (t) {
  t.deepEqual(
    transform('## Hello, world!'),
    'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";\n\n_createVNode(_Fragment, null, [_createVNode("h2", null, ["Hello, world!"])]);',
    'should integrate w/ `@vue/babel-plugin-jsx`'
  )

  t.deepEqual(
    transform('<x y className="a" {...z} />!'),
    [
      'import { createVNode as _createVNode, mergeProps as _mergeProps, resolveComponent as _resolveComponent, Fragment as _Fragment } from "vue";',
      '',
      '_createVNode(_Fragment, null, [_createVNode("p", null, [_createVNode(_resolveComponent("x"), _mergeProps({',
      '  "y": true,',
      '  "className": "a"',
      '}, z), null), "!"])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX JSX)'
  )

  t.deepEqual(
    transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
    [
      'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";',
      '',
      '_createVNode(_Fragment, null, [_createVNode("svg", {',
      '  "viewBox": "0 0 1 1"',
      '}, [_createVNode("rect", null, null)])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX JSX, SVG)'
  )

  t.deepEqual(
    transform('Sum: {1 + 1}.'),
    'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";\n\n_createVNode(_Fragment, null, [_createVNode("p", null, ["Sum: ", 1 + 1, "."])]);',
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX expression)'
  )

  t.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    [
      'import { createVNode as _createVNode, Fragment as _Fragment } from "vue";',
      'import x from "y";',
      'export const name = "World";',
      '',
      '_createVNode(_Fragment, null, [_createVNode("h2", null, ["Hello, ", name, "!"])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX.js ESM)'
  )

  t.deepEqual(
    transform(
      'import /* a */ a from "b"\n\n# {/* b*/} <x {...{/* c */}} d={/* d*/e} />'
    ),
    [
      'import { createVNode as _createVNode, mergeProps as _mergeProps, resolveComponent as _resolveComponent, Fragment as _Fragment } from "vue";',
      'import',
      '/* a */',
      'a from "b";',
      '',
      '_createVNode(_Fragment, null, [_createVNode("h1", null, [" ", _createVNode(_resolveComponent("x"), _mergeProps({}, {',
      '  "d": e',
      '}), null)])]);'
    ].join('\n'),
    'should support comments when integrating w/ `@babel/plugin-transform-react-jsx`'
  )

  t.end()

  function transform(doc) {
    var mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown]
    })

    var hast = toHast(mdast, {
      passThrough: [
        'mdxFlowExpression',
        'mdxJsxFlowElement',
        'mdxJsxTextElement',
        'mdxTextExpression',
        'mdxjsEsm'
      ]
    })

    return babel.transformFromAstSync(toBabel(toEstree(hast)), null, {
      babelrc: false,
      configFile: false,
      plugins: ['@vue/babel-plugin-jsx']
    }).code
  }
})

function acornClean(node) {
  node.sourceType = 'module'

  walk(node, {enter: enter})

  return JSON.parse(JSON.stringify(node))

  function enter(node) {
    delete node.raw
    delete node.start
    delete node.end
  }
}

function acornParse(doc) {
  var comments = []
  var tree = acorn.Parser.extend(jsx()).parse(doc, {onComment: comments})
  tree.comments = comments
  return tree
}

function recastSerialize(tree) {
  tree.comments = undefined
  return recast.prettyPrint(tree).code
}
