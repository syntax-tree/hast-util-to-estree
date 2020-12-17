'use strict'

var assert = require('assert')
var test = require('tape')
var babel = require('@babel/core')
var generate = require('@babel/generator').default
var acorn = require('acorn')
var jsx = require('acorn-jsx')
var toBabel = require('estree-to-babel')
var h = require('hastscript')
var s = require('hastscript/svg')
var fromMarkdown = require('mdast-util-from-markdown')
var toHast = require('mdast-util-to-hast')
var mdxFromMarkdown = require('mdast-util-mdx').fromMarkdown
var mdxjs = require('micromark-extension-mdxjs')
var recast = require('recast')
var visit = require('unist-util-visit')
var toEstree = require('.')

var ac = acorn.Parser.extend(jsx())

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
      sourceType: 'module'
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
          }
        }
      ],
      sourceType: 'module'
    },
    'should support position info when defined'
  )

  t.deepEqual(
    toEstree(h('div')),
    cleanEstree(ac.parse('<div/>')),
    'should match acorn'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [h('div')]}),
    cleanEstree(ac.parse('<><div/></>')),
    'should support a root'
  )

  t.deepEqual(
    toEstree({type: 'root', children: []}),
    cleanEstree(ac.parse('<></>')),
    'should support an empty root'
  )

  t.deepEqual(
    toEstree({type: 'root'}),
    cleanEstree(ac.parse('<></>')),
    'should support a root w/o `chuldren`'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'doctype', name: 'html'}]}),
    cleanEstree(ac.parse('<></>')),
    'should ignore a doctype'
  )

  t.deepEqual(
    toEstree({type: 'doctype', name: 'html'}),
    {type: 'Program', body: [], sourceType: 'module'},
    'should ignore *just* a doctype'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'text', value: 'a'}]}),
    cleanEstree(ac.parse('<>{"a"}</>')),
    'should support a text'
  )

  t.deepEqual(
    toEstree({type: 'text', value: 'a'}),
    cleanEstree(ac.parse('<>{"a"}</>')),
    'should support *just* a text'
  )

  t.deepEqual(
    toEstree({type: 'root', children: [{type: 'text'}]}),
    cleanEstree(ac.parse('<></>')),
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
                  innerComments: [{type: 'CommentBlock', value: 'x'}],
                  comments: [
                    {type: 'Block', value: 'x', leading: false, trailing: true}
                  ]
                }
              }
            ]
          }
        }
      ],
      sourceType: 'module'
    },
    'should support a comment'
  )

  t.deepEqual(
    toEstree(h('a', {x: true})),
    cleanEstree(ac.parse('<a x/>')),
    'should support an attribute (boolean)'
  )

  t.deepEqual(
    toEstree(h('a', {x: 'y'})),
    cleanEstree(ac.parse('<a x="y"/>')),
    'should support an attribute (value)'
  )

  t.deepEqual(
    toEstree(h('a', {style: 'width:1px'})),
    cleanEstree(ac.parse('<a style={{width:"1px"}}/>')),
    'should support an attribute (style)'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'a',
      properties: {style: {width: 1}}
    }),
    cleanEstree(ac.parse('<a style={{width:"1"}}/>')),
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
    cleanEstree(
      ac.parse(
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
    cleanEstree(
      ac.parse(
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
    cleanEstree(ac.parse('<a><b/></a>')),
    'should support a child'
  )

  t.deepEqual(
    toEstree(h('a', ['\n', h('b'), '\n'])),
    cleanEstree(ac.parse('<a>{"\\n"}<b/>{"\\n"}</a>')),
    'should support inter-element whitespace'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {}}),
    cleanEstree(ac.parse('<x/>')),
    'should support an element w/o `children`'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'xYx', properties: {}}),
    cleanEstree(ac.parse('<xYx/>')),
    'should support an element w/ casing in the `tagName`'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', children: []}),
    cleanEstree(ac.parse('<x/>')),
    'should support an element w/o `properties`'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {y: null}}),
    cleanEstree(ac.parse('<x/>')),
    'should ignore a `null` prop'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {y: undefined}}),
    cleanEstree(ac.parse('<x/>')),
    'should ignore an `undefined` prop'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {y: NaN}}),
    cleanEstree(ac.parse('<x/>')),
    'should ignore an `NaN` prop'
  )

  t.deepEqual(
    toEstree({type: 'element', tagName: 'x', properties: {allowFullScreen: 0}}),
    cleanEstree(ac.parse('<x/>')),
    'should ignore a falsey boolean prop'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {className: ['y', 'z']}
    }),
    cleanEstree(ac.parse('<x className="y z"/>')),
    'should support space-separated lists'
  )

  t.deepEqual(
    toEstree({
      type: 'element',
      tagName: 'x',
      properties: {srcSet: ['y', 'z']}
    }),
    cleanEstree(ac.parse('<x srcSet="y, z"/>')),
    'should support comma-separated lists'
  )

  t.deepEqual(
    toEstree(s('svg', {viewBox: '0 0 1 1'})),
    cleanEstree(ac.parse('<svg viewBox="0 0 1 1"/>')),
    'should support SVG'
  )

  t.deepEqual(
    toEstree(s('x', {g1: [1, 2]})),
    cleanEstree(ac.parse('<x g1="1 2"/>')),
    'should support SVG w/ an explicit `space` (check)'
  )

  t.deepEqual(
    toEstree(s('x', {g1: [1, 2]}), {space: 'svg'}),
    cleanEstree(ac.parse('<x g1="1, 2"/>')),
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
    cleanEstree(ac.parse('<p><b>{"a"}</b>{" "}<i>{"b"}</i>{"."}</p>')),
    'should support whitespace between elements'
  )

  t.deepEqual(
    toEstree({type: 'mdxJsxTextElement'}),
    cleanEstree(ac.parse('<></>')),
    'should support an custom `mdxJsxTextElement` node w/o name, attributes, or children'
  )

  t.end()
})

test('integration (recast)', function (t) {
  t.deepEqual(
    recast.prettyPrint(toEstree(h('x'))).code,
    '<x />;',
    'should format an element (void)'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree(h('x', 'y'))).code,
    '<x>{"y"}</x>;',
    'should format an element w/ text child'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree(h('x', h('y', 'z')))).code,
    '<x><y>{"z"}</y></x>;',
    'should format an element w/ element child'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree(h('x', {y: true, x: 'a'}))).code,
    '<x y x="a" />;',
    'should format an element w/ props'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree(h('x', {style: 'a:b'}))).code,
    '<x\n    style={{\n        a: "b"\n    }} />;',
    'should format an element w/ style props'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree(h('x', [{type: 'comment', value: 'y'}]))).code,
    '<x>{/*y*/}</x>;',
    'should format a comment'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree({type: 'comment', value: 'y'})).code,
    '<>{/*y*/}</>;',
    'should format just a comment'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree({type: 'root', children: []})).code,
    '<></>;',
    'should format a root'
  )

  t.deepEqual(
    recast.prettyPrint(toEstree(s('svg', {viewBox: '0 0 1 1'}))).code,
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
    '<x>{\n    /*y*/\n  }</x>;',
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

  t.deepEqual(
    transform('## Hello, {/* x */}!'),
    '<><h2>{"Hello, "}{}{"!"}</h2></>;',
    'should transform an empty MDX.js expression'
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
    transform('<x style={{color: "red"}} />'),
    '<><x\n        style={{\n            color: "red"\n        }} /></>;',
    'should transform object attribute value expressions'
  )

  t.deepEqual(
    transform('## Hello, <x {...props} />'),
    '<><h2>{"Hello, "}<x {...props} /></h2></>;',
    'should transform attribute expressions on JSX elements'
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
      visit(hast, types, cleanEstree)
    }

    return recast.prettyPrint(toEstree(hast)).code

    function cleanEstree(node) {
      if (node.data && node.data.estree) {
        delete node.data.estree
      }

      if (typeof node.value === 'object') {
        cleanEstree(node.value)
      }

      if (node.attributes) {
        node.attributes.forEach(cleanEstree)
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
      'import { Fragment as _Fragment } from "react/jsx-runtime";',
      'import { jsxs as _jsxs } from "react/jsx-runtime";',
      'import { jsx as _jsx } from "react/jsx-runtime";',
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
    'import { Fragment as _Fragment } from "vue";\n\n_createVNode(_Fragment, null, [_createVNode("h2", null, ["Hello, world!"])]);',
    'should integrate w/ `@vue/babel-plugin-jsx`'
  )

  t.deepEqual(
    transform('<x y className="a" {...z} />!'),
    [
      'import { mergeProps as _mergeProps } from "vue";',
      'import { resolveComponent as _resolveComponent } from "vue";',
      'import { Fragment as _Fragment } from "vue";',
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
      'import { Fragment as _Fragment } from "vue";',
      '',
      '_createVNode(_Fragment, null, [_createVNode("svg", {',
      '  "viewBox": "0 0 1 1"',
      '}, [_createVNode("rect", null, null)])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX JSX, SVG)'
  )

  t.deepEqual(
    transform('Sum: {1 + 1}.'),
    'import { Fragment as _Fragment } from "vue";\n\n_createVNode(_Fragment, null, [_createVNode("p", null, ["Sum: ", 1 + 1, "."])]);',
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX expression)'
  )

  t.deepEqual(
    transform(
      'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
    ),
    [
      'import { Fragment as _Fragment } from "vue";',
      'import x from "y";',
      'export const name = "World";',
      '',
      '_createVNode(_Fragment, null, [_createVNode("h2", null, ["Hello, ", name, "!"])]);'
    ].join('\n'),
    'should integrate w/ `@vue/babel-plugin-jsx` (MDX.js ESM)'
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

    var prefix = 'import { createVNode as _createVNode } from "vue";\n'

    var code = babel.transformFromAstSync(toBabel(toEstree(hast)), null, {
      babelrc: false,
      configFile: false,
      plugins: ['@vue/babel-plugin-jsx']
    }).code

    assert(code.slice(0, prefix.length) === prefix, 'should have a vue header')

    return code.slice(prefix.length)
  }
})

function cleanEstree(node) {
  node.sourceType = 'module'

  one(node)

  return JSON.parse(JSON.stringify(node))

  function one(node) {
    var key
    var index

    for (key in node) {
      if (node[key] && typeof node[key] === 'object') {
        if ('length' in node[key]) {
          index = -1
          while (++index < node[key].length) {
            if ('type' in node[key][index]) {
              one(node[key][index])
            }
          }
        } else if ('type' in node[key]) {
          one(node[key])
        }
      }
    }

    delete node.start
    delete node.end

    return node
  }
}
