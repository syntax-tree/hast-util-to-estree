'use strict'

module.exports = toEstree

var commas = require('comma-separated-tokens')
var whitespace = require('hast-util-whitespace')
var find = require('property-information/find')
var hastToReact = require('property-information/hast-to-react.json')
var html = require('property-information/html')
var svg = require('property-information/svg')
var spaces = require('space-separated-tokens')
var style = require('style-to-object')
var position = require('unist-util-position')
var zwitch = require('zwitch')

var push = [].push

var handlers = {
  comment: comment,
  doctype: ignore,
  element: element,
  mdxjsEsm: mdxjsEsm,
  mdxFlowExpression: mdxExpression,
  mdxJsxFlowElement: mdxJsxElement,
  mdxJsxTextElement: mdxJsxElement,
  mdxTextExpression: mdxExpression,
  root: root,
  text: text
}

function toEstree(tree, options) {
  var context = {
    schema: options && options.space === 'svg' ? svg : html,
    esm: [],
    handle: zwitch('type', {
      invalid: invalid,
      unknown: unknown,
      handlers: handlers
    })
  }
  var result = context.handle(tree, context)
  var body = context.esm

  if (result) {
    if (result.type !== 'JSXFragment' && result.type !== 'JSXElement') {
      result = createJsxFragment(null, [result])
    }

    body.push(create(null, {type: 'ExpressionStatement', expression: result}))
  }

  return create(null, {type: 'Program', body: body, sourceType: 'module'})
}

function invalid(value) {
  throw new Error('Cannot handle value `' + value + '`, expected node')
}

function unknown(node) {
  throw new Error('Cannot handle unknown node `' + node.type + '`')
}

function ignore() {}

function comment(node) {
  return create(node, {
    type: 'JSXExpressionContainer',
    expression: create(node, {
      type: 'JSXEmptyExpression',
      // Babel.
      innerComments: [create(node, {type: 'CommentBlock', value: node.value})],
      // Recast.
      comments: [
        create(node, {
          type: 'Block',
          value: node.value,
          leading: false,
          trailing: true
        })
      ]
    })
  })
}

// eslint-disable-next-line complexity
function element(node, context) {
  var parentSchema = context.schema
  var schema = parentSchema
  var props = node.properties || {}
  var attributes = []
  var children
  var info
  var prop
  var value
  var cssProp
  var cssProperties

  if (parentSchema.space === 'html' && node.tagName.toLowerCase() === 'svg') {
    schema = svg
    context.schema = schema
  }

  children = all(node, context)

  for (prop in props) {
    value = props[prop]
    info = find(schema, prop)

    // Ignore nullish and `NaN` values.
    // Ignore `false` and falsey known booleans.
    if (
      value == null ||
      value !== value ||
      value === false ||
      (!value && info.boolean)
    ) {
      continue
    }

    prop = info.space
      ? hastToReact[info.property] || info.property
      : info.attribute

    if (value && typeof value === 'object' && 'length' in value) {
      // Accept `array`.
      // Most props are space-separated.
      value = (info.commaSeparated ? commas : spaces).stringify(value)
    }

    if (prop === 'style' && typeof value === 'string') {
      value = parseStyle(value, node.tagName)
    }

    if (value === true) {
      value = null
    } else if (prop === 'style' && typeof value === 'object') {
      cssProperties = []

      for (cssProp in value) {
        cssProperties.push(
          create(null, {
            type: 'Property',
            method: false,
            shorthand: false,
            computed: false,
            key: create(null, {type: 'Identifier', name: cssProp}),
            value: create(null, {
              type: 'Literal',
              value: String(value[cssProp]),
              raw: JSON.stringify(String(value[cssProp]))
            }),
            kind: 'init'
          })
        )
      }

      value = create(null, {
        type: 'JSXExpressionContainer',
        expression: create(null, {
          type: 'ObjectExpression',
          properties: cssProperties
        })
      })
    } else {
      value = create(null, {
        type: 'Literal',
        value: String(value),
        raw: JSON.stringify(String(value))
      })
    }

    attributes.push(
      create(null, {
        type: 'JSXAttribute',
        name: create(null, {type: 'JSXIdentifier', name: prop}),
        value: value
      })
    )
  }

  // Restore parent schema.
  context.schema = parentSchema

  return createJsxElement(node, node.tagName, attributes, children)
}

function mdxjsEsm(node, context) {
  push.apply(
    context.esm,
    (node.data && node.data.estree && node.data.estree.body) || []
  )
}

function mdxExpression(node) {
  return create(node, {
    type: 'JSXExpressionContainer',
    expression:
      (node.data &&
        node.data.estree &&
        node.data.estree.body[0] &&
        node.data.estree.body[0].expression) ||
      create(node, {type: 'JSXEmptyExpression'})
  })
}

// eslint-disable-next-line complexity
function mdxJsxElement(node, context) {
  var parentSchema = context.schema
  var schema = parentSchema
  var attrs = node.attributes || []
  var attributes = []
  var index = -1
  var children
  var attr

  if (
    node.name &&
    parentSchema.space === 'html' &&
    node.name.toLowerCase() === 'svg'
  ) {
    schema = svg
    context.schema = schema
  }

  children = all(node, context)

  while (++index < attrs.length) {
    attr = attrs[index]

    if (attr.type === 'mdxJsxAttribute') {
      attributes.push(
        create(null, {
          type: 'JSXAttribute',
          name: createJsxName(attr.name),
          value:
            attr.value == null
              ? null
              : typeof attr.value === 'object'
              ? // MDXJsxAttributeValueExpression.
                create(node, {
                  type: 'JSXExpressionContainer',
                  expression:
                    (attr.value.data &&
                      attr.value.data.estree &&
                      attr.value.data.estree.body[0] &&
                      attr.value.data.estree.body[0].expression) ||
                    create(null, {type: 'JSXEmptyExpression'})
                })
              : // Anything else.
                create(null, {
                  type: 'Literal',
                  value: String(attr.value),
                  raw: JSON.stringify(String(attr.value))
                })
        })
      )
    }
    // MDXJsxExpressionAttribute.
    else {
      attributes.push(
        create(null, {
          type: 'JSXSpreadAttribute',
          argument:
            (attr.data &&
              attr.data.estree &&
              attr.data.estree.body[0] &&
              attr.data.estree.body[0].expression &&
              attr.data.estree.body[0].expression.properties &&
              attr.data.estree.body[0].expression.properties[0] &&
              attr.data.estree.body[0].expression.properties[0].argument) ||
            create(null, {type: 'ObjectExpression', properties: {}})
        })
      )
    }
  }

  // Restore parent schema.
  context.schema = parentSchema

  return node.name
    ? createJsxElement(node, node.name, attributes, children)
    : createJsxFragment(node, children)
}

function root(node, context) {
  var children = all(node, context)
  var cleanChildren = []
  var index = -1
  var queue

  // Remove surrounding whitespace nodes from the fragment.
  while (++index < children.length) {
    if (
      children[index].type === 'JSXExpressionContainer' &&
      children[index].expression.type === 'Literal' &&
      whitespace(children[index].expression.value)
    ) {
      if (queue) {
        queue.push(children[index])
      }
    } else {
      push.apply(cleanChildren, queue)
      cleanChildren.push(children[index])
      queue = []
    }
  }

  return createJsxFragment(node, cleanChildren)
}

function text(node) {
  var value = String(node.value || '')

  if (!value) return

  return create(node, {
    type: 'JSXExpressionContainer',
    expression: create(node, {
      type: 'Literal',
      value: value,
      raw: JSON.stringify(value)
    })
  })
}

function createJsxElement(node, name, attributes, children) {
  return create(node, {
    type: 'JSXElement',
    openingElement: create(null, {
      type: 'JSXOpeningElement',
      attributes: attributes,
      name: createJsxName(name),
      selfClosing: !children.length
    }),
    closingElement: children.length
      ? create(null, {type: 'JSXClosingElement', name: createJsxName(name)})
      : null,
    children: children
  })
}

function createJsxName(name) {
  var parts
  var node

  if (name.indexOf('.') > -1) {
    parts = name.split('.')
    node = create(null, {type: 'JSXIdentifier', name: parts.shift()})
    while (parts.length) {
      node = {
        type: 'JSXMemberExpression',
        object: node,
        property: create(null, {type: 'JSXIdentifier', name: parts.shift()})
      }
    }
  } else if (name.indexOf(':') > -1) {
    parts = name.split(':')
    node = {
      type: 'JSXNamespacedName',
      namespace: create(null, {type: 'JSXIdentifier', name: parts[0]}),
      name: create(null, {type: 'JSXIdentifier', name: parts[1]})
    }
  } else {
    node = create(null, {type: 'JSXIdentifier', name: name})
  }

  return node
}

function createJsxFragment(node, children) {
  return create(node, {
    type: 'JSXFragment',
    openingFragment: create(null, {
      type: 'JSXOpeningFragment',
      attributes: [],
      selfClosing: false
    }),
    closingFragment: create(null, {type: 'JSXClosingFragment'}),
    children: children
  })
}

function all(parent, context) {
  var children = parent.children || []
  var results = []
  var index = -1
  var result

  while (++index < children.length) {
    result = context.handle(children[index], context)
    if (result) {
      results.push(result)
    }
  }

  return results
}

function create(hast, estree) {
  var p = position(hast)

  if (p.start.line) {
    estree.loc = {
      start: {line: p.start.line, column: p.start.column - 1},
      end: {line: p.end.line, column: p.end.column - 1}
    }
  }

  return estree
}

function parseStyle(value, tagName) {
  var result = {}

  try {
    style(value, iterator)
  } catch (error) {
    error.message =
      tagName + '[style]' + error.message.slice('undefined'.length)
    throw error
  }

  return result

  function iterator(name, value) {
    if (name.slice(0, 4) === '-ms-') name = 'ms-' + name.slice(4)
    result[name.replace(/-([a-z])/g, styleReplacer)] = value
  }
}

function styleReplacer($0, $1) {
  return $1.toUpperCase()
}
