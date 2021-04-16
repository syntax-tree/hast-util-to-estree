'use strict'

module.exports = toEstree

var commas = require('comma-separated-tokens')
var attachComments = require('estree-util-attach-comments')
var {
  start: identifierStart,
  cont: identifierCont
} = require('estree-util-is-identifier-name')
var whitespace = require('hast-util-whitespace')
var find = require('property-information/find')
var hastToReact = require('property-information/hast-to-react.json')
var html = require('property-information/html')
var svg = require('property-information/svg')
var spaces = require('space-separated-tokens')
var style = require('style-to-object')
var position = require('unist-util-position')
var zwitch = require('zwitch')

var own = {}.hasOwnProperty
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
    comments: [],
    esm: [],
    handle: zwitch('type', {
      invalid: invalid,
      unknown: unknown,
      handlers: Object.assign({}, handlers, options && options.handlers)
    })
  }
  var result = context.handle(tree, context)
  var body = context.esm

  if (result) {
    if (result.type !== 'JSXFragment' && result.type !== 'JSXElement') {
      result = create(tree, {
        type: 'JSXFragment',
        openingFragment: {
          type: 'JSXOpeningFragment',
          attributes: [],
          selfClosing: false
        },
        closingFragment: {type: 'JSXClosingFragment'},
        children: [result]
      })
    }

    body.push(create(tree, {type: 'ExpressionStatement', expression: result}))
  }

  return create(tree, {
    type: 'Program',
    body: body,
    sourceType: 'module',
    comments: context.comments
  })
}

function invalid(value) {
  throw new Error('Cannot handle value `' + value + '`, expected node')
}

function unknown(node) {
  throw new Error('Cannot handle unknown node `' + node.type + '`')
}

function ignore() {}

function comment(node, context) {
  var esnode = inherit(node, {type: 'Block', value: node.value})

  context.comments.push(esnode)

  return create(node, {
    type: 'JSXExpressionContainer',
    expression: create(node, {
      type: 'JSXEmptyExpression',
      comments: [Object.assign({}, esnode, {leading: false, trailing: true})]
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
        cssProperties.push({
          type: 'Property',
          method: false,
          shorthand: false,
          computed: false,
          key: {type: 'Identifier', name: cssProp},
          value: {type: 'Literal', value: String(value[cssProp])},
          kind: 'init'
        })
      }

      value = {
        type: 'JSXExpressionContainer',
        expression: {type: 'ObjectExpression', properties: cssProperties}
      }
    } else {
      value = {type: 'Literal', value: String(value)}
    }

    if (jsxIdentifierName(prop)) {
      attributes.push({
        type: 'JSXAttribute',
        name: {type: 'JSXIdentifier', name: prop},
        value: value
      })
    } else {
      // No need to worry about `style` (which has a `JSXExpressionContainer`
      // value) because that’s a valid identifier.
      attributes.push({
        type: 'JSXSpreadAttribute',
        argument: {
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              method: false,
              shorthand: false,
              computed: false,
              key: {type: 'Literal', value: String(prop)},
              value: value || {type: 'Literal', value: true},
              kind: 'init'
            }
          ]
        }
      })
    }
  }

  // Restore parent schema.
  context.schema = parentSchema

  return inherit(node, {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      attributes: attributes,
      name: createJsxName(node.tagName),
      selfClosing: !children.length
    },
    closingElement: children.length
      ? {type: 'JSXClosingElement', name: createJsxName(node.tagName)}
      : null,
    children: children
  })
}

function mdxjsEsm(node, context) {
  var estree = node.data && node.data.estree
  var comments = (estree && estree.comments) || []

  if (estree) {
    push.apply(context.comments, comments)
    attachComments(estree, comments)
    push.apply(context.esm, estree.body)
  }
}

function mdxExpression(node, context) {
  var estree = node.data && node.data.estree
  var expression

  if (estree) {
    push.apply(context.comments, estree.comments)
    attachComments(estree, estree.comments)
    expression = estree.body[0] && estree.body[0].expression
  }

  return inherit(node, {
    type: 'JSXExpressionContainer',
    expression: expression || create(node, {type: 'JSXEmptyExpression'})
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
  var value
  var expression
  var estree

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
    value = attr.value

    if (attr.type === 'mdxJsxAttribute') {
      if (value == null) {
        // Empty.
      }
      // `MDXJsxAttributeValueExpression`.
      else if (typeof value === 'object') {
        estree = value.data && value.data.estree
        expression = null

        if (estree) {
          push.apply(context.comments, estree.comments)
          attachComments(estree, estree.comments)
          expression = estree.body[0] && estree.body[0].expression
        }

        value = inherit(value, {
          type: 'JSXExpressionContainer',
          expression: expression || {type: 'JSXEmptyExpression'}
        })
      }
      // Anything else.
      else {
        value = {type: 'Literal', value: String(value)}
      }

      attributes.push(
        inherit(attr, {
          type: 'JSXAttribute',
          name: createJsxName(attr.name),
          value: value
        })
      )
    }
    // MDXJsxExpressionAttribute.
    else {
      estree = attr.data && attr.data.estree
      value = null

      if (estree) {
        push.apply(context.comments, estree.comments)
        attachComments(estree, estree.comments)
        value =
          estree.body[0] &&
          estree.body[0].expression &&
          estree.body[0].expression.properties &&
          estree.body[0].expression.properties[0] &&
          estree.body[0].expression.properties[0].argument
      }

      attributes.push(
        inherit(attr, {
          type: 'JSXSpreadAttribute',
          argument: value || {type: 'ObjectExpression', properties: {}}
        })
      )
    }
  }

  // Restore parent schema.
  context.schema = parentSchema

  return inherit(
    node,
    node.name
      ? {
          type: 'JSXElement',
          openingElement: {
            type: 'JSXOpeningElement',
            attributes: attributes,
            name: createJsxName(node.name),
            selfClosing: !children.length
          },
          closingElement: children.length
            ? {type: 'JSXClosingElement', name: createJsxName(node.name)}
            : null,
          children: children
        }
      : {
          type: 'JSXFragment',
          openingFragment: {
            type: 'JSXOpeningFragment',
            attributes: [],
            selfClosing: false
          },
          closingFragment: {type: 'JSXClosingFragment'},
          children: children
        }
  )
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

  return inherit(node, {
    type: 'JSXFragment',
    openingFragment: {
      type: 'JSXOpeningFragment',
      attributes: [],
      selfClosing: false
    },
    closingFragment: {type: 'JSXClosingFragment'},
    children: cleanChildren
  })
}

function text(node) {
  var value = String(node.value || '')

  if (!value) return

  return create(node, {
    type: 'JSXExpressionContainer',
    expression: inherit(node, {type: 'Literal', value: value})
  })
}

function all(parent, context) {
  var children = parent.children || []
  var results = []
  var index = -1
  var result

  while (++index < children.length) {
    result = context.handle(children[index], context)
    if (Array.isArray(result)) {
      results = results.concat(result)
    } else if (result) {
      results.push(result)
    }
  }

  return results
}

// Take positional info and data from `hast`.
function inherit(hast, esnode) {
  var left = hast.data
  var right
  var key

  create(hast, esnode)

  if (left) {
    for (key in left) {
      if (own.call(left, key) && key !== 'estree') {
        if (!right) right = {}
        right[key] = left[key]
      }
    }

    if (right) {
      esnode.data = right
    }
  }

  return esnode
}

// Take just positional info.
function create(hast, esnode) {
  var p = position(hast)

  if (p.start.line) {
    esnode.start = p.start.offset
    esnode.end = p.end.offset
    esnode.loc = {
      start: {line: p.start.line, column: p.start.column - 1},
      end: {line: p.end.line, column: p.end.column - 1}
    }
    esnode.range = [p.start.offset, p.end.offset]
  }

  return esnode
}

function createJsxName(name) {
  var parts
  var node

  if (name.indexOf('.') > -1) {
    parts = name.split('.')
    node = {type: 'JSXIdentifier', name: parts.shift()}
    while (parts.length) {
      node = {
        type: 'JSXMemberExpression',
        object: node,
        property: {type: 'JSXIdentifier', name: parts.shift()}
      }
    }
  } else if (name.indexOf(':') > -1) {
    parts = name.split(':')
    node = {
      type: 'JSXNamespacedName',
      namespace: {type: 'JSXIdentifier', name: parts[0]},
      name: {type: 'JSXIdentifier', name: parts[1]}
    }
  } else {
    node = {type: 'JSXIdentifier', name: name}
  }

  return node
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

/**
 * Checks if the given string is a valid identifier name.
 *
 * @param {string} name
 */
function jsxIdentifierName(name) {
  var index = -1

  while (++index < name.length) {
    if (!(index ? cont : identifierStart)(name.charCodeAt(index))) return false
  }

  // `false` if `name` is empty.
  return index > 0

  function cont(code) {
    return identifierCont(code) || code === 45 /* `-` */
  }
}
