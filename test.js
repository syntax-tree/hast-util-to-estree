/**
 * @typedef {import('estree').Program} Program
 * @typedef {import('estree').Node} Node
 * @typedef {import('hast').Nodes} HastNodes
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxAttribute} MdxJsxAttribute
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxAttributeValueExpression} MdxJsxAttributeValueExpression
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxExpressionAttribute} MdxJsxExpressionAttribute
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import acornJsx from 'acorn-jsx'
import {attachComments} from 'estree-util-attach-comments'
import {fromJs} from 'esast-util-from-js'
import {jsx, toJs} from 'estree-util-to-js'
import {walk} from 'estree-walker'
import {h, s} from 'hastscript'
import {toEstree} from 'hast-util-to-estree'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {mdxFromMarkdown} from 'mdast-util-mdx'
import {toHast} from 'mdast-util-to-hast'
import {mdxjs} from 'micromark-extension-mdxjs'
import {visit} from 'unist-util-visit'

/** @type {['mdxFlowExpression', 'mdxJsxFlowElement', 'mdxJsxTextElement', 'mdxTextExpression', 'mdxjsEsm']} */
const passThrough = [
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'mdxjsEsm'
]

test('toEstree', async function (t) {
  await t.test('should expose the public api', async function () {
    assert.deepEqual(Object.keys(await import('hast-util-to-estree')).sort(), [
      'defaultHandlers',
      'toEstree'
    ])
  })

  await t.test('should crash on a non-node', async function () {
    assert.throws(function () {
      toEstree(
        // @ts-expect-error: check how the runtime handles a non-node.
        {}
      )
    }, /Cannot handle value `\[object Object]`/)
  })

  await t.test('should crash on an unknown node', async function () {
    assert.throws(function () {
      toEstree(
        // @ts-expect-error: check how the runtime handles an unknown node.
        {type: 'unknown'}
      )
    }, /Cannot handle unknown node `unknown`/)
  })

  await t.test('should transform an empty element', async function () {
    assert.deepEqual(toEstree(h('div')), {
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
    })
  })

  await t.test('should support position info when defined', async function () {
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
      }
    )
  })

  await t.test('should support data when defined', async function () {
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
      }
    )
  })

  await t.test('should match acorn', async function () {
    assert.deepEqual(toEstree(h('div')), acornClean(acornParse('<div/>')))
  })

  await t.test('should support a root', async function () {
    assert.deepEqual(
      toEstree({type: 'root', children: [h('div')]}),
      acornClean(acornParse('<><div/></>'))
    )
  })

  await t.test('should support an empty root', async function () {
    assert.deepEqual(
      toEstree({type: 'root', children: []}),
      acornClean(acornParse('<></>'))
    )
  })

  await t.test('should support a root w/o `chuldren`', async function () {
    assert.deepEqual(
      toEstree(
        // @ts-expect-error: check how the runtime handles missing `children`.
        {type: 'root'}
      ),
      acornClean(acornParse('<></>'))
    )
  })

  await t.test('should ignore a doctype', async function () {
    assert.deepEqual(
      toEstree({type: 'root', children: [{type: 'doctype'}]}),
      acornClean(acornParse('<></>'))
    )
  })

  await t.test('should ignore *just* a doctype', async function () {
    assert.deepEqual(toEstree({type: 'doctype'}), {
      type: 'Program',
      body: [],
      sourceType: 'module',
      comments: []
    })
  })

  await t.test('should support a text', async function () {
    assert.deepEqual(
      toEstree({type: 'root', children: [{type: 'text', value: 'a'}]}),
      acornClean(acornParse('<>{"a"}</>'))
    )
  })

  await t.test('should support *just* a text', async function () {
    assert.deepEqual(
      toEstree({type: 'text', value: 'a'}),
      acornClean(acornParse('<>{"a"}</>'))
    )
  })

  await t.test('should support a text w/o `value`', async function () {
    assert.deepEqual(
      toEstree(
        // @ts-expect-error: check how the runtime handles missing `value`.
        {type: 'root', children: [{type: 'text'}]}
      ),
      acornClean(acornParse('<></>'))
    )
  })

  await t.test('should support a comment', async function () {
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
                      {
                        type: 'Block',
                        value: 'x',
                        leading: false,
                        trailing: true
                      }
                    ]
                  }
                }
              ]
            }
          }
        ],
        sourceType: 'module',
        comments: [{type: 'Block', value: 'x'}]
      }
    )
  })

  await t.test('should support an attribute (boolean)', async function () {
    assert.deepEqual(
      toEstree(h('a', {x: true})),
      acornClean(acornParse('<a x/>'))
    )
  })

  await t.test('should support an attribute (value)', async function () {
    assert.deepEqual(
      toEstree(h('a', {x: 'y'})),
      acornClean(acornParse('<a x="y"/>'))
    )
  })

  await t.test('should support an attribute (style)', async function () {
    assert.deepEqual(
      toEstree(h('a', {style: 'width:1px'})),
      acornClean(acornParse('<a style={{width:"1px"}}/>'))
    )
  })

  await t.test(
    'should support an attribute (style, as object)',
    async function () {
      assert.deepEqual(
        toEstree({
          type: 'element',
          tagName: 'a',
          // @ts-expect-error: check how the runtime handles `style` as an object.
          properties: {style: {width: 1}}
        }),
        acornClean(acornParse('<a style={{width:"1"}}/>'))
      )
    }
  )

  await t.test(
    'should support an attribute (style, as object, prefixes)',
    async function () {
      assert.deepEqual(
        toEstree({
          type: 'element',
          tagName: 'a',
          properties: {
            style: {
              // @ts-expect-error: check how the runtime handles `style` as an object.
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
        )
      )
    }
  )

  await t.test(
    'should support an attribute (style, string, prefixes)',
    async function () {
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
        )
      )
    }
  )

  await t.test('should crash on an incorrect style string', async function () {
    assert.throws(function () {
      toEstree(h('a', {style: 'x'}))
    }, /Could not parse `style` attribute on `a`/)
  })

  await t.test(
    'should support a non-identifier as a property (1)',
    async function () {
      assert.deepEqual(
        toEstree({
          type: 'element',
          tagName: 'a',
          properties: {1: true},
          children: []
        }),
        acornClean(acornParse('<a {...{"1": true}} />'))
      )
    }
  )

  await t.test(
    'should support a non-identifier as a property (2)',
    async function () {
      assert.deepEqual(
        toEstree({
          type: 'element',
          tagName: 'a',
          properties: {'b+': 'c'},
          children: []
        }),
        acornClean(acornParse('<a {...{"b+": "c"}} />'))
      )
    }
  )

  await t.test(
    'should support a non-identifier as a property (3)',
    async function () {
      assert.deepEqual(
        toEstree({
          type: 'element',
          tagName: 'a',
          properties: {'b-c': 'd'},
          children: []
        }),
        acornClean(acornParse('<a b-c="d" />'))
      )
    }
  )

  await t.test('should support a child', async function () {
    assert.deepEqual(
      toEstree(h('a', [h('b')])),
      acornClean(acornParse('<a><b/></a>'))
    )
  })

  await t.test('should support inter-element whitespace', async function () {
    assert.deepEqual(
      toEstree(h('a', ['\n', h('b'), '\n'])),
      acornClean(acornParse('<a>{"\\n"}<b/>{"\\n"}</a>'))
    )
  })

  await t.test('should support an element w/o `children`', async function () {
    assert.deepEqual(
      toEstree({type: 'element', tagName: 'x', properties: {}, children: []}),
      acornClean(acornParse('<x/>'))
    )
  })

  await t.test(
    'should support an element w/ casing in the `tagName`',
    async function () {
      assert.deepEqual(
        toEstree({
          type: 'element',
          tagName: 'xYx',
          properties: {},
          children: []
        }),
        acornClean(acornParse('<xYx/>'))
      )
    }
  )

  await t.test('should support an element w/o `properties`', async function () {
    assert.deepEqual(
      toEstree(
        // @ts-expect-error: check how the runtime handles missing `properties`.
        {type: 'element', tagName: 'x', children: []}
      ),
      acornClean(acornParse('<x/>'))
    )
  })

  await t.test('should ignore a `null` prop', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'x',
        properties: {y: null},
        children: []
      }),
      acornClean(acornParse('<x/>'))
    )
  })

  await t.test('should ignore an `undefined` prop', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'x',
        properties: {y: undefined},
        children: []
      }),
      acornClean(acornParse('<x/>'))
    )
  })

  await t.test('should ignore an `NaN` prop', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'x',
        properties: {y: Number.NaN},
        children: []
      }),
      acornClean(acornParse('<x/>'))
    )
  })

  await t.test('should ignore a falsey boolean prop', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'x',
        properties: {allowFullScreen: 0},
        children: []
      }),
      acornClean(acornParse('<x/>'))
    )
  })

  await t.test('should support space-separated lists', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'x',
        properties: {className: ['y', 'z']},
        children: []
      }),
      acornClean(acornParse('<x className="y z"/>'))
    )
  })

  await t.test('should support comma-separated lists', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'x',
        properties: {accept: ['y', 'z']},
        children: []
      }),
      acornClean(acornParse('<x accept="y, z"/>'))
    )
  })

  await t.test('should support SVG', async function () {
    assert.deepEqual(
      toEstree(s('svg', {viewBox: '0 0 1 1'})),
      acornClean(acornParse('<svg viewBox="0 0 1 1"/>'))
    )
  })

  await t.test(
    'should support SVG w/ an explicit `space` (check)',
    async function () {
      assert.deepEqual(
        toEstree(s('x', {g1: [1, 2]})),
        acornClean(acornParse('<x g1="1 2"/>'))
      )
    }
  )

  await t.test('should support SVG w/ an explicit `space`', async function () {
    assert.deepEqual(
      toEstree(s('x', {g1: [1, 2]}), {space: 'svg'}),
      acornClean(acornParse('<x g1="1, 2"/>'))
    )
  })

  await t.test('should support whitespace between elements', async function () {
    assert.deepEqual(
      toEstree({
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'b',
            properties: {},
            children: [{type: 'text', value: 'a'}]
          },
          {type: 'text', value: ' '},
          {
            type: 'element',
            tagName: 'i',
            properties: {},
            children: [{type: 'text', value: 'b'}]
          },
          {type: 'text', value: '.'}
        ]
      }),
      acornClean(acornParse('<p><b>{"a"}</b>{" "}<i>{"b"}</i>{"."}</p>'))
    )
  })

  await t.test(
    'should support an custom `mdxJsxTextElement` node w/o name, attributes, or children',
    async function () {
      assert.deepEqual(
        toEstree(
          // @ts-expect-error: check how the runtime handles missing fields.
          {type: 'mdxJsxTextElement'}
        ),
        acornClean(acornParse('<></>'))
      )
    }
  )

  await t.test(
    'should support custom handler that returns an array',
    async function () {
      assert.deepEqual(
        toEstree(
          {
            type: 'root',
            // @ts-expect-error: check how the runtime an unknown node.
            children: [{type: 'array', value: 'comma,seperated,array'}]
          },
          {
            handlers: {
              array(/** @type {{type: 'array', value: string}} */ node) {
                const elements = node.value.split(',').map(function (value) {
                  return {type: 'Literal', value}
                })
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
        }
      )
    }
  )

  await t.test(
    'should ignore text line endings between table elements',
    async function () {
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
        }
      )
    }
  )

  await t.test(
    'should use react casing for element attributes by default',
    async function () {
      assert.equal(
        toJs(toEstree(h('#a.b.c', 'd')), {handlers: jsx}).value,
        '<div id="a" className="b c">{"d"}</div>;\n'
      )
    }
  )

  await t.test(
    "should support `elementAttributeNameCase: 'html'`",
    async function () {
      assert.equal(
        toJs(toEstree(h('#a.b.c', 'd'), {elementAttributeNameCase: 'html'}), {
          handlers: jsx
        }).value,
        '<div id="a" class="b c">{"d"}</div>;\n'
      )
    }
  )

  await t.test(
    'should use react casing for css properties by default',
    async function () {
      assert.equal(
        toJs(toEstree(h('h1', {style: 'background-color: red;'}, 'x')), {
          handlers: jsx
        }).value,
        '<h1 style={{\n  backgroundColor: "red"\n}}>{"x"}</h1>;\n'
      )
    }
  )

  await t.test(
    "should support `stylePropertyNameCase: 'css'`",
    async function () {
      assert.equal(
        toJs(
          toEstree(h('h1', {style: 'background-color: red;'}, 'x'), {
            stylePropertyNameCase: 'css'
          }),
          {handlers: jsx}
        ).value,
        '<h1 style={{\n  "background-color": "red"\n}}>{"x"}</h1>;\n'
      )
    }
  )

  await t.test(
    'should support vendor prefixes and css variables (dom)',
    async function () {
      assert.equal(
        toJs(
          toEstree(
            h('h1', {
              style:
                '-webkit-transform: rotate(0.01turn); -ms-transform: rotate(0.01turn); --fg: #0366d6; color: var(--fg)'
            })
          ),
          {handlers: jsx}
        ).value,
        '<h1 style={{\n  WebkitTransform: "rotate(0.01turn)",\n  msTransform: "rotate(0.01turn)",\n  "--fg": "#0366d6",\n  color: "var(--fg)"\n}} />;\n'
      )
    }
  )

  await t.test(
    'should support vendor prefixes and css variables (css)',
    async function () {
      assert.equal(
        toJs(
          toEstree(
            h('h1', {
              style:
                '-webkit-transform: rotate(0.01turn); -ms-transform: rotate(0.01turn); --fg: #0366d6; color: var(--fg)'
            }),
            {stylePropertyNameCase: 'css'}
          ),
          {handlers: jsx}
        ).value,
        '<h1 style={{\n  "-webkit-transform": "rotate(0.01turn)",\n  "-ms-transform": "rotate(0.01turn)",\n  "--fg": "#0366d6",\n  color: "var(--fg)"\n}} />;\n'
      )
    }
  )
})

test('integration (micromark-extension-mdxjs, mdast-util-mdx)', async function (t) {
  await t.test(
    'should transform an MDX.js expression (text)',
    async function () {
      assert.deepEqual(
        transform('## Hello, {props}!'),
        '<><h2>{"Hello, "}{props}{"!"}</h2></>;\n'
      )
    }
  )

  await t.test(
    'should transform an MDX.js expression (flow)',
    async function () {
      assert.deepEqual(transform('{1 + 1}'), '<>{1 + 1}</>;\n')
    }
  )

  await t.test(
    'should transform an empty MDX.js expression',
    async function () {
      assert.deepEqual(
        transform('## Hello, {/* x */}!'),
        '<><h2>{"Hello, "}{}{"!"}</h2></>;\n'
      )
    }
  )

  await t.test(
    'should transform comments in an MDX expression',
    async function () {
      assert.deepEqual(transform('{a + /* 1 */ 2}'), '<>{a + 2}</>;\n')
    }
  )

  await t.test(
    'should transform a void MDX.js JSX element (text)',
    async function () {
      assert.deepEqual(
        transform('## Hello, <x />'),
        '<><h2>{"Hello, "}<x /></h2></>;\n'
      )
    }
  )

  await t.test(
    'should transform boolean and literal attributes on JSX elements',
    async function () {
      assert.deepEqual(
        transform('## Hello, <x y z="a" />'),
        '<><h2>{"Hello, "}<x y z="a" /></h2></>;\n'
      )
    }
  )

  await t.test(
    'should transform attribute value expressions on JSX elements',
    async function () {
      assert.deepEqual(
        transform('## Hello, <x y={1 + 1} />'),
        '<><h2>{"Hello, "}<x y={1 + 1} /></h2></>;\n'
      )
    }
  )

  await t.test(
    'should crash on empty attribute value expressions',
    async function () {
      assert.throws(function () {
        transform('<x y={/* x */} />')
      }, /Unexpected empty expression/)
    }
  )

  await t.test(
    'should transform comments in an MDX attribute value expression',
    async function () {
      assert.deepEqual(
        transform('<a b={1 + /* 1 */ 2} />'),
        '<><a b={1 + 2} /></>;\n'
      )
    }
  )

  await t.test(
    'should transform object attribute value expressions',
    async function () {
      assert.deepEqual(
        transform('<x style={{color: "red"}} />'),
        '<><x style={{\n  color: "red"\n}} /></>;\n'
      )
    }
  )

  await t.test(
    'should transform attribute value expressions w/o estrees',
    async function () {
      assert.deepEqual(
        transform('## Hello, <x a={b} />', true),
        '<><h2>{"Hello, "}<x a={} /></h2></>;\n'
      )
    }
  )

  await t.test(
    'should transform attribute expressions on JSX elements',
    async function () {
      assert.deepEqual(
        transform('## Hello, <x {...props} />'),
        '<><h2>{"Hello, "}<x {...props} /></h2></>;\n'
      )
    }
  )

  await t.test(
    'should transform comments in an MDX attribute expressions',
    async function () {
      assert.deepEqual(
        transform('<a {...{c: /* 1 */ 1, d: 2 /* 2 */}} />'),
        '<><a {...{\n  /*2*/\n  c: 1,\n  d: 2\n}} /></>;\n'
      )
    }
  )

  await t.test(
    'should transform attribute expressions w/o estrees',
    async function () {
      assert.deepEqual(
        transform('## Hello, <x {...props} />', true),
        '<><h2>{"Hello, "}<x {...{}} /></h2></>;\n'
      )
    }
  )

  await t.test('should support member names', async function () {
    assert.deepEqual(
      transform('<a.b.c d>e</a.b.c>'),
      '<><p><a.b.c d>{"e"}</a.b.c></p></>;\n'
    )
  })

  await t.test('should support namespace names', async function () {
    assert.deepEqual(
      transform('<a:b d>e</a:b>'),
      '<><p><a:b d>{"e"}</a:b></p></>;\n'
    )
  })

  await t.test('should support namespace attribute names', async function () {
    assert.deepEqual(
      transform('<x xml:lang="en" />'),
      '<><x xml:lang="en" /></>;\n'
    )
  })

  await t.test(
    'should transform children in MDX.js elements',
    async function () {
      assert.deepEqual(
        transform('<x>\n  - y\n</x>'),
        '<><x><ul>{"\\n"}<li>{"y"}</li>{"\\n"}</ul></x></>;\n'
      )
    }
  )

  await t.test('should transform MDX.js JSX fragments', async function () {
    assert.deepEqual(
      transform('## Hello, <>{props}</>!'),
      '<><h2>{"Hello, "}<>{props}</>{"!"}</h2></>;\n'
    )
  })

  await t.test('should transform MDX.js ESM', async function () {
    assert.deepEqual(
      transform(
        'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!'
      ),
      'import x from "y";\nexport const name = "World";\n<><h2>{"Hello, "}{name}{"!"}</h2></>;\n'
    )
  })

  await t.test('should transform comments in MDX.js ESM', async function () {
    assert.deepEqual(
      transform(
        'import /* 1 */ name /* 2 */ from /* 3 */ "a" /* 4 */\n\n\n## Hello, {name}!'
      ),
      'import name from "a";\n<><h2>{"Hello, "}{name}{"!"}</h2></>;\n'
    )
  })

  await t.test('should transform *just* MDX.js ESM', async function () {
    assert.deepEqual(
      transform('import x from "y"\nexport const name = "World"'),
      'import x from "y";\nexport const name = "World";\n<></>;\n'
    )
  })

  await t.test('should transform ESM w/o estrees', async function () {
    assert.deepEqual(
      transform(
        'import x from "y"\nexport const name = "World"\n\n## Hello, {name}!',
        true
      ),
      '<><h2>{"Hello, "}{}{"!"}</h2></>;\n'
    )
  })

  await t.test('should support svg', async function () {
    assert.deepEqual(
      transform('<svg viewBox="0 0 1 1"><rect /></svg>'),
      '<><svg viewBox="0 0 1 1"><rect /></svg></>;\n'
    )
  })

  await t.test('should support an empty document', async function () {
    assert.deepEqual(transform(''), '<></>;\n')
  })

  await t.test(
    'should ignore initial and trailing whitespace in a root',
    async function () {
      assert.deepEqual(
        toJs(
          toEstree({
            type: 'root',
            children: [
              {type: 'text', value: ' '},
              {type: 'text', value: 'x'},
              {type: 'text', value: ' '},
              {type: 'text', value: 'y'},
              {type: 'text', value: ' '}
            ]
          }),
          {handlers: jsx}
        ).value,
        '<>{"x"}{" "}{"y"}</>;\n'
      )
    }
  )

  /**
   * @param {string} doc
   *   MDX.
   * @param {boolean} [clean=false]
   *   Whether to clean the tree (default: `false`).
   */
  function transform(doc, clean) {
    const mdast = fromMarkdown(doc, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()]
    })

    const hast = toHast(mdast, {passThrough})

    if (clean && hast) visit(hast, passThrough, hastClean)

    const program = toEstree(hast)
    attachComments(program, program.comments)
    delete program.comments

    return toJs(program, {handlers: jsx}).value

    /**
     * @param {HastNodes | MdxJsxAttribute | MdxJsxAttributeValueExpression | MdxJsxExpressionAttribute} node
     */
    function hastClean(node) {
      let index = -1

      if (node.data && 'estree' in node.data) delete node.data.estree

      if ('value' in node && node.value && typeof node.value === 'object') {
        hastClean(node.value)
      }

      if ('attributes' in node && node.attributes) {
        while (++index < node.attributes.length) {
          hastClean(node.attributes[index])
        }
      }
    }
  }
})

/**
 * @param {Program} node
 */
function acornClean(node) {
  node.sourceType = 'module'

  walk(node, {enter})

  return JSON.parse(JSON.stringify(node))

  /** @param {Node} node */
  function enter(node) {
    // @ts-expect-error: custom field added by esast.
    delete node.position

    // See: <https://github.com/syntax-tree/esast-util-from-estree/issues/3>
    if (node.type === 'JSXOpeningFragment') {
      // @ts-expect-error: added by `acorn`.
      delete node.attributes
      // @ts-expect-error: added by `acorn`.
      delete node.selfClosing
    }
  }
}

/**
 * @param {string} doc
 *   JavaScript module.
 * @returns {Program}
 *   ESTree program.
 */
function acornParse(doc) {
  return fromJs(doc, {
    module: true,
    plugins: [acornJsx()]
  })
}
