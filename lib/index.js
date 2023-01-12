/**
 * @typedef {import('unist').Parent} UnistParent
 *
 * @typedef {import('hast').Comment} Comment
 * @typedef {import('hast').Content} Content
 * @typedef {import('hast').DocType} Doctype
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Text} Text
 *
 * @typedef {import('estree').Comment} EstreeComment
 * @typedef {import('estree').Directive} EstreeDirective
 * @typedef {import('estree').Expression} EstreeExpression
 * @typedef {import('estree').ExpressionStatement} EstreeExpressionStatement
 * @typedef {import('estree').Literal} EstreeLiteral
 * @typedef {import('estree').ModuleDeclaration} EstreeModuleDeclaration
 * @typedef {import('estree').Node} EstreeNode
 * @typedef {import('estree').Program} EstreeProgram
 * @typedef {import('estree').Property} EstreeProperty
 * @typedef {import('estree').Statement} EstreeStatement
 *
 * @typedef {import('estree-jsx').JSXAttribute} EstreeJsxAttribute
 * @typedef {import('estree-jsx').JSXElement} EstreeJsxElement
 * @typedef {import('estree-jsx').JSXExpressionContainer} EstreeJsxExpressionContainer
 * @typedef {import('estree-jsx').JSXEmptyExpression} EstreeJsxEmptyExpression
 * @typedef {import('estree-jsx').JSXFragment} EstreeJsxFragment
 * @typedef {import('estree-jsx').JSXIdentifier} JSXIdentifier
 * @typedef {import('estree-jsx').JSXMemberExpression} JSXMemberExpression
 * @typedef {import('estree-jsx').JSXOpeningElement} EstreeJsxOpeningElement
 * @typedef {import('estree-jsx').JSXSpreadAttribute} EstreeJsxSpreadAttribute
 *
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxAttribute} MdxJsxAttribute
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxAttributeValueExpression} MdxJsxAttributeValueExpression
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxExpressionAttribute} MdxJsxExpressionAttribute
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxFlowElement} MdxJsxFlowElement
 * @typedef {import('mdast-util-mdx-jsx').MdxJsxTextElement} MdxJsxTextElement
 *
 * @typedef {import('mdast-util-mdx-expression').MdxFlowExpression} MdxFlowExpression
 * @typedef {import('mdast-util-mdx-expression').MdxTextExpression} MdxTextExpression
 *
 * @typedef {import('mdast-util-mdxjs-esm').MdxjsEsm} MdxjsEsm
 *
 * @typedef {import('property-information').Schema} Schema
 */

/**
 * @typedef {Root | Content} Node
 * @typedef {Extract<Node, UnistParent>} Parent
 * @typedef {EstreeJsxOpeningElement['name']} EstreeJsxElementName
 * @typedef {EstreeJsxAttribute['name']} EstreeJsxAttributeName
 * @typedef {EstreeJsxElement['children'][number]} EstreeJsxChild
 *
 * @typedef {'html' | 'svg'} Space
 *   Namespace.
 *
 * @callback Handle
 *   Turn a hast node into an estree node.
 * @param {any} node
 *   Expected hast node.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {EstreeJsxChild | null | undefined | void}
 *   estree node.
 *
 * @typedef Options
 *   Configuration.
 * @property {Space | null | undefined} [space='html']
 *   Which space the document is in.
 *
 *   When an `<svg>` element is found in the HTML space, this package already
 *   automatically switches to and from the SVG space when entering and exiting
 *   it.
 * @property {Record<string, Handle | null | undefined> | null | undefined} [handlers={}]
 *   Custom handlers.
 *
 * @typedef State
 *   Info passed around about the current state.
 * @property {Schema} schema
 *   Current schema.
 * @property {Array<EstreeComment>} comments
 *   List of comments.
 * @property {Array<EstreeDirective | EstreeStatement | EstreeModuleDeclaration>} esm
 *   List of top-level content.
 * @property {Handle} handle
 *   Transform any hast node into estree.
 */

import {stringify as commas} from 'comma-separated-tokens'
import {attachComments} from 'estree-util-attach-comments'
import {
  start as identifierStart,
  cont as identifierCont
} from 'estree-util-is-identifier-name'
import {whitespace} from 'hast-util-whitespace'
import {html, svg, find, hastToReact} from 'property-information'
import {stringify as spaces} from 'space-separated-tokens'
// @ts-expect-error: `style-to-object` doesn’t support actual ESM + TS correctly.
import styleToObject from 'style-to-object'
import {position} from 'unist-util-position'
import {zwitch} from 'zwitch'

/** @type {(value: string, iterator?: (property: string, value: string, declaration: unknown) => void) => Record<string, string>} */
const style = styleToObject

const own = {}.hasOwnProperty
const tableElements = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td'
])

/**
 * Transform a hast tree (with embedded MDX nodes) into an estree.
 *
 * @param {Node | MdxJsxAttributeValueExpression | MdxJsxAttribute | MdxJsxExpressionAttribute | MdxJsxFlowElement | MdxJsxTextElement | MdxFlowExpression | MdxTextExpression} tree
 *   hast tree.
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {EstreeProgram}
 *   estree program node.
 */
export function toEstree(tree, options) {
  const options_ = options || {}
  const handle = zwitch('type', {
    invalid,
    unknown,
    handlers: {
      comment,
      doctype: ignore,
      element,
      mdxjsEsm,
      mdxFlowExpression: mdxExpression,
      mdxJsxFlowElement: mdxJsxElement,
      mdxJsxTextElement: mdxJsxElement,
      mdxTextExpression: mdxExpression,
      root,
      text,
      ...options_.handlers
    }
  })
  /** @type {State} */
  const state = {
    schema: options_.space === 'svg' ? svg : html,
    comments: [],
    esm: [],
    handle
  }
  let result = state.handle(tree, state)
  const body = state.esm

  if (result) {
    if (result.type !== 'JSXFragment' && result.type !== 'JSXElement') {
      result = {
        type: 'JSXFragment',
        openingFragment: {type: 'JSXOpeningFragment'},
        closingFragment: {type: 'JSXClosingFragment'},
        children: [result]
      }
      patch(tree, result)
    }

    /** @type {EstreeExpressionStatement} */
    // @ts-expect-error Types are wrong (`expression` *can* be JSX).
    const statement = {type: 'ExpressionStatement', expression: result}
    patch(tree, statement)
    body.push(statement)
  }

  /** @type {EstreeProgram} */
  const program = {
    type: 'Program',
    body,
    sourceType: 'module',
    comments: state.comments
  }
  patch(tree, program)
  return program
}

/**
 * Crash on an invalid value.
 *
 * @param {unknown} value
 *   Non-node.
 * @returns {never}
 *   Nothing (crashes).
 */
function invalid(value) {
  throw new Error('Cannot handle value `' + value + '`, expected node')
}

/**
 * Crash on an unknown node.
 *
 * @param {unknown} node
 *   Unknown node.
 * @returns {never}
 *   Nothing (crashes).
 */
function unknown(node) {
  // @ts-expect-error: JS guarantees there’s a `type`.
  throw new Error('Cannot handle unknown node `' + node.type + '`')
}

/**
 * Handle a node that is ignored.
 *
 * @returns {void}
 *   Nothing.
 */
function ignore() {}

/**
 * Turn a hast comment into an estree node.
 *
 * @param {Comment} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {EstreeJsxExpressionContainer}
 *   estree expression.
 */
function comment(node, state) {
  /** @type {EstreeComment} */
  const result = {type: 'Block', value: node.value}
  inherit(node, result)
  state.comments.push(result)

  /** @type {EstreeJsxEmptyExpression} */
  const expression = {
    type: 'JSXEmptyExpression',
    // @ts-expect-error: `comments` is custom.
    // To do: deep clone.
    comments: [Object.assign({}, result, {leading: false, trailing: true})]
  }
  patch(node, expression)

  /** @type {EstreeJsxExpressionContainer} */
  const container = {type: 'JSXExpressionContainer', expression}
  patch(node, container)
  return container
}

/**
 * Turn a hast element into an estree node.
 *
 * @param {Element} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {EstreeJsxElement}
 *   estree expression.
 */
// eslint-disable-next-line complexity
function element(node, state) {
  const parentSchema = state.schema
  let schema = parentSchema
  const props = node.properties || {}

  if (parentSchema.space === 'html' && node.tagName.toLowerCase() === 'svg') {
    schema = svg
    state.schema = schema
  }

  const children = all(node, state)

  /** @type {Array<EstreeJsxAttribute | EstreeJsxSpreadAttribute>} */
  const attributes = []
  /** @type {string} */
  let prop

  for (prop in props) {
    if (own.call(props, prop)) {
      let value = props[prop]
      const info = find(schema, prop)
      /** @type {EstreeJsxAttribute['value']} */
      let attributeValue

      // Ignore nullish and `NaN` values.
      // Ignore `false` and falsey known booleans.
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'number' && Number.isNaN(value)) ||
        value === false ||
        (!value && info.boolean)
      ) {
        continue
      }

      prop = info.space
        ? hastToReact[info.property] || info.property
        : info.attribute

      if (Array.isArray(value)) {
        // Accept `array`.
        // Most props are space-separated.
        value = info.commaSeparated ? commas(value) : spaces(value)
      }

      if (prop === 'style') {
        /** @type {Record<string, string>} */
        // @ts-expect-error Assume `value` is an object otherwise.
        const styleValue =
          typeof value === 'string' ? parseStyle(value, node.tagName) : value

        /** @type {Array<EstreeProperty>} */
        const cssProperties = []
        /** @type {string} */
        let cssProp

        for (cssProp in styleValue) {
          // eslint-disable-next-line max-depth
          if (own.call(styleValue, cssProp)) {
            cssProperties.push({
              type: 'Property',
              method: false,
              shorthand: false,
              computed: false,
              key: {type: 'Identifier', name: cssProp},
              value: {type: 'Literal', value: String(styleValue[cssProp])},
              kind: 'init'
            })
          }
        }

        attributeValue = {
          type: 'JSXExpressionContainer',
          expression: {type: 'ObjectExpression', properties: cssProperties}
        }
      } else if (value === true) {
        attributeValue = null
      } else {
        attributeValue = {type: 'Literal', value: String(value)}
      }

      if (jsxIdentifierName(prop)) {
        attributes.push({
          type: 'JSXAttribute',
          name: {type: 'JSXIdentifier', name: prop},
          value: attributeValue
        })
      } else {
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
                // @ts-expect-error No need to worry about `style` (which has a
                // `JSXExpressionContainer` value) because that’s a valid identifier.
                value: attributeValue || {type: 'Literal', value: true},
                kind: 'init'
              }
            ]
          }
        })
      }
    }
  }

  // Restore parent schema.
  state.schema = parentSchema

  /** @type {EstreeJsxElement} */
  const result = {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      attributes,
      name: createJsxName(node.tagName),
      selfClosing: children.length === 0
    },
    closingElement:
      children.length > 0
        ? {type: 'JSXClosingElement', name: createJsxName(node.tagName)}
        : null,
    children
  }
  inherit(node, result)
  return result
}

/**
 * Handle an MDX ESM node.
 *
 * @param {MdxjsEsm} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {void}
 *   Nothing.
 */
function mdxjsEsm(node, state) {
  const estree = node.data && node.data.estree
  const comments = (estree && estree.comments) || []

  if (estree) {
    state.comments.push(...comments)
    attachComments(estree, comments)
    state.esm.push(...estree.body)
  }
}

/**
 * Turn an MDX expression node into an estree node.
 *
 * @param {MdxFlowExpression | MdxTextExpression} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {EstreeJsxExpressionContainer}
 *   estree expression.
 */
function mdxExpression(node, state) {
  const estree = node.data && node.data.estree
  const comments = (estree && estree.comments) || []
  /** @type {EstreeExpression | EstreeJsxEmptyExpression | undefined} */
  let expression

  if (estree) {
    state.comments.push(...comments)
    attachComments(estree, estree.comments)
    expression =
      (estree.body[0] &&
        estree.body[0].type === 'ExpressionStatement' &&
        estree.body[0].expression) ||
      undefined
  }

  if (!expression) {
    expression = {type: 'JSXEmptyExpression'}
    patch(node, expression)
  }

  /** @type {EstreeJsxExpressionContainer} */
  const result = {type: 'JSXExpressionContainer', expression}
  inherit(node, result)
  return result
}

/**
 * Turn an MDX JSX element node into an estree node.
 *
 * @param {MdxJsxFlowElement | MdxJsxTextElement} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {EstreeJsxElement | EstreeJsxFragment}
 *   JSX element or fragment.
 */
// eslint-disable-next-line complexity
function mdxJsxElement(node, state) {
  const parentSchema = state.schema
  let schema = parentSchema
  const attrs = node.attributes || []
  let index = -1

  if (
    node.name &&
    parentSchema.space === 'html' &&
    node.name.toLowerCase() === 'svg'
  ) {
    schema = svg
    state.schema = schema
  }

  const children = all(node, state)
  /** @type {Array<EstreeJsxAttribute | EstreeJsxSpreadAttribute>} */
  const attributes = []

  while (++index < attrs.length) {
    const attr = attrs[index]
    const value = attr.value
    /** @type {EstreeJsxAttribute['value']} */
    let attributeValue

    if (attr.type === 'mdxJsxAttribute') {
      if (value === undefined || value === null) {
        attributeValue = null
        // Empty.
      }
      // `MdxJsxAttributeValueExpression`.
      else if (typeof value === 'object') {
        const estree = value.data && value.data.estree
        const comments = (estree && estree.comments) || []
        /** @type {EstreeExpression | undefined} */
        let expression

        if (estree) {
          state.comments.push(...comments)
          attachComments(estree, estree.comments)
          // Should exist.
          /* c8 ignore next 5 */
          expression =
            (estree.body[0] &&
              estree.body[0].type === 'ExpressionStatement' &&
              estree.body[0].expression) ||
            undefined
        }

        attributeValue = {
          type: 'JSXExpressionContainer',
          expression: expression || {type: 'JSXEmptyExpression'}
        }
        inherit(value, attributeValue)
      }
      // Anything else.
      else {
        attributeValue = {type: 'Literal', value: String(value)}
      }

      /** @type {EstreeJsxAttribute} */
      const attribute = {
        type: 'JSXAttribute',
        name: createJsxName(attr.name, true),
        value: attributeValue
      }

      inherit(attr, attribute)
      attributes.push(attribute)
    }
    // MdxJsxExpressionAttribute.
    else {
      const estree = attr.data && attr.data.estree
      const comments = (estree && estree.comments) || []
      /** @type {EstreeJsxSpreadAttribute['argument'] | undefined} */
      let argumentValue

      if (estree) {
        state.comments.push(...comments)
        attachComments(estree, estree.comments)
        // Should exist.
        /* c8 ignore next 10 */
        argumentValue =
          (estree.body[0] &&
            estree.body[0].type === 'ExpressionStatement' &&
            estree.body[0].expression &&
            estree.body[0].expression.type === 'ObjectExpression' &&
            estree.body[0].expression.properties &&
            estree.body[0].expression.properties[0] &&
            estree.body[0].expression.properties[0].type === 'SpreadElement' &&
            estree.body[0].expression.properties[0].argument) ||
          undefined
      }

      /** @type {EstreeJsxSpreadAttribute} */
      const attribute = {
        type: 'JSXSpreadAttribute',
        argument: argumentValue || {type: 'ObjectExpression', properties: []}
      }
      inherit(attr, attribute)
      attributes.push(attribute)
    }
  }

  // Restore parent schema.
  state.schema = parentSchema

  /** @type {EstreeJsxElement | EstreeJsxFragment} */
  const result = node.name
    ? {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          attributes,
          name: createJsxName(node.name),
          selfClosing: children.length === 0
        },
        closingElement:
          children.length > 0
            ? {type: 'JSXClosingElement', name: createJsxName(node.name)}
            : null,
        children
      }
    : {
        type: 'JSXFragment',
        openingFragment: {type: 'JSXOpeningFragment'},
        closingFragment: {type: 'JSXClosingFragment'},
        children
      }

  inherit(node, result)
  return result
}

/**
 * Turn a hast root node into an estree node.
 *
 * @param {Root} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {EstreeJsxFragment}
 *   estree JSX fragment.
 */
function root(node, state) {
  const children = all(node, state)
  /** @type {Array<EstreeJsxChild>} */
  const cleanChildren = []
  let index = -1
  /** @type {Array<EstreeJsxChild> | undefined} */
  let queue

  // Remove surrounding whitespace nodes from the fragment.
  while (++index < children.length) {
    const child = children[index]

    if (
      child.type === 'JSXExpressionContainer' &&
      child.expression.type === 'Literal' &&
      whitespace(child.expression.value)
    ) {
      if (queue) queue.push(child)
    } else {
      if (queue) cleanChildren.push(...queue)
      cleanChildren.push(child)
      queue = []
    }
  }

  /** @type {EstreeJsxFragment} */
  const result = {
    type: 'JSXFragment',
    openingFragment: {type: 'JSXOpeningFragment'},
    closingFragment: {type: 'JSXClosingFragment'},
    children: cleanChildren
  }
  inherit(node, result)
  return result
}

/**
 * Turn a hast text node into an estree node.
 *
 * @param {Text} node
 *   hast node to transform.
 * @returns {EstreeJsxExpressionContainer | void}
 *   JSX expression.
 */
function text(node) {
  const value = String(node.value || '')

  if (value) {
    /** @type {EstreeLiteral} */
    const result = {type: 'Literal', value}
    inherit(node, result)
    /** @type {EstreeJsxExpressionContainer} */
    const container = {type: 'JSXExpressionContainer', expression: result}
    patch(node, container)
    return container
  }
}

/**
 * @param {Parent | MdxJsxFlowElement | MdxJsxTextElement} parent
 *   hast node whose children to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {Array<EstreeJsxChild>}
 *   estree nodes.
 */
function all(parent, state) {
  const children = parent.children || []
  let index = -1
  /** @type {Array<EstreeJsxChild>} */
  const results = []
  // Currently, a warning is triggered by react for *any* white space in
  // tables.
  // So we remove the pretty lines for now.
  // See: <https://github.com/facebook/react/pull/7081>.
  // See: <https://github.com/facebook/react/pull/7515>.
  // See: <https://github.com/remarkjs/remark-react/issues/64>.
  const ignoreLineBreak =
    state.schema.space === 'html' &&
    parent.type === 'element' &&
    tableElements.has(parent.tagName.toLowerCase())

  while (++index < children.length) {
    const child = children[index]

    if (ignoreLineBreak && child.type === 'text' && child.value === '\n') {
      continue
    }

    const result = state.handle(child, state)

    if (Array.isArray(result)) {
      results.push(...result)
    } else if (result) {
      results.push(result)
    }
  }

  return results
}

/**
 * Take positional info and data from `hast`.
 *
 * Use `patch` if you don’t want data.
 *
 * @param {Node | MdxJsxAttributeValueExpression | MdxJsxAttribute | MdxJsxExpressionAttribute | MdxJsxFlowElement | MdxJsxTextElement | MdxFlowExpression | MdxTextExpression} from
 *   hast node to take positional info and data from.
 * @param {EstreeNode | EstreeComment} to
 *   estree node to add positional info and data to.
 * @returns {void}
 *   Nothing.
 */
function inherit(from, to) {
  const left = from.data
  /** @type {Record<string, unknown> | undefined} */
  let right
  /** @type {string} */
  let key

  patch(from, to)

  if (left) {
    for (key in left) {
      if (own.call(left, key) && key !== 'estree') {
        if (!right) right = {}
        right[key] = left[key]
      }
    }

    if (right) {
      // @ts-expect-error `esast` extension.
      to.data = right
    }
  }
}

/**
 * Take positional info from `from`.
 *
 * Use `inherit` if you also want data.
 *
 * @param {Node | MdxJsxAttributeValueExpression | MdxJsxAttribute | MdxJsxExpressionAttribute | MdxJsxFlowElement | MdxJsxTextElement | MdxFlowExpression | MdxTextExpression} from
 *   hast node to take positional info from.
 * @param {EstreeNode | EstreeComment} to
 *   estree node to add positional info to.
 * @returns {void}
 *   Nothing.
 */
function patch(from, to) {
  const p = position(from)

  if (
    p.start.line &&
    p.start.offset !== undefined &&
    p.end.offset !== undefined
  ) {
    // @ts-expect-error acorn-style.
    to.start = p.start.offset
    // @ts-expect-error acorn-style.
    to.end = p.end.offset
    to.loc = {
      start: {line: p.start.line, column: p.start.column - 1},
      end: {line: p.end.line, column: p.end.column - 1}
    }
    to.range = [p.start.offset, p.end.offset]
  }
}

/**
 * Turn a serialized identifier into an actual estree node.
 *
 * @param name
 *   Name.
 * @param attribute
 *   Whether this is an attribute or not.
 * @returns
 *   estree `JSXIdentifier` node.
 */
const createJsxName =
  /**
   * @type {(
   *   ((name: string, attribute: true) => EstreeJsxAttributeName) &
   *   ((name: string, attribute?: false | null | undefined) => EstreeJsxElementName)
   * )}
   */
  (
    /**
     * @param {string} name
     * @param {boolean | null | undefined} [attribute=false]
     * @returns {EstreeJsxElementName}
     */
    function (name, attribute) {
      if (!attribute && name.includes('.')) {
        const parts = name.split('.')
        let part = parts.shift()
        /** @type {JSXIdentifier | JSXMemberExpression} */
        // @ts-expect-error: hush, the first is always defined.
        let node = {type: 'JSXIdentifier', name: part}

        while ((part = parts.shift())) {
          node = {
            type: 'JSXMemberExpression',
            object: node,
            property: {type: 'JSXIdentifier', name: part}
          }
        }

        return node
      }

      if (name.includes(':')) {
        const parts = name.split(':')
        return {
          type: 'JSXNamespacedName',
          namespace: {type: 'JSXIdentifier', name: parts[0]},
          name: {type: 'JSXIdentifier', name: parts[1]}
        }
      }

      return {type: 'JSXIdentifier', name}
    }
  )

/**
 * Parse CSS rules as a declaration.
 *
 * @param {string} value
 *   CSS text.
 * @param {string} tagName
 *   Element name.
 * @returns {Record<string, string>}
 *   Props.
 */
function parseStyle(value, tagName) {
  /** @type {Record<string, string>} */
  const result = {}

  try {
    style(value, iterator)
  } catch (error) {
    const exception = /** @type {Error} */ (error)
    exception.message =
      tagName + '[style]' + exception.message.slice('undefined'.length)
    throw error
  }

  return result

  /**
   * Add `name`, as a CSS prop, to `result`.
   *
   * @param {string} name
   *   Key.
   * @param {string} value
   *   Value.
   * @returns {void}
   *   Nothing.
   */
  function iterator(name, value) {
    if (name.slice(0, 4) === '-ms-') name = 'ms-' + name.slice(4)
    result[name.replace(/-([a-z])/g, styleReplacer)] = value
  }
}

/**
 * Uppercase `$1`.
 *
 * @param {string} _
 *   Whatever.
 * @param {string} $1
 *   an ASCII alphabetic.
 * @returns {string}
 *   Uppercased `$1`.
 */
function styleReplacer(_, $1) {
  return $1.toUpperCase()
}

/**
 * Checks if the given string is a valid identifier name.
 *
 * Allows dashes, so it’s actually JSX identifier names.
 *
 * @param {string} name
 *   Whatever.
 * @returns {boolean}
 *   Whether `name` is a valid JSX identifier.
 */
function jsxIdentifierName(name) {
  let index = -1

  while (++index < name.length) {
    if (!(index ? cont : identifierStart)(name.charCodeAt(index))) return false
  }

  // `false` if `name` is empty.
  return index > 0

  /**
   * @param {number} code
   * @returns {boolean}
   */
  function cont(code) {
    return identifierCont(code) || code === 45 /* `-` */
  }
}
