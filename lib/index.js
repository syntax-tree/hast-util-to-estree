/**
 * @typedef {import('hast').Content} Content
 * @typedef {import('hast').Root} Root
 *
 * @typedef {import('estree').ExpressionStatement} ExpressionStatement
 * @typedef {import('estree').Program} Program
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
 * @typedef {import('./state.js').Options} Options
 */

/**
 * @typedef {Root | Content | MdxJsxAttributeValueExpression | MdxJsxAttribute | MdxJsxExpressionAttribute | MdxJsxFlowElement | MdxJsxTextElement | MdxFlowExpression | MdxTextExpression} Node
 */

import {createState} from './state.js'

/**
 * Transform a hast tree (with embedded MDX nodes) into an estree.
 *
 * @param {Node} tree
 *   hast tree.
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {Program}
 *   estree program node.
 */
export function toEstree(tree, options) {
  const state = createState(options || {})
  let result = state.handle(tree)
  const body = state.esm

  if (result) {
    if (result.type !== 'JSXFragment' && result.type !== 'JSXElement') {
      result = {
        type: 'JSXFragment',
        openingFragment: {type: 'JSXOpeningFragment'},
        closingFragment: {type: 'JSXClosingFragment'},
        children: [result]
      }
      state.patch(tree, result)
    }

    /** @type {ExpressionStatement} */
    // @ts-expect-error Types are wrong (`expression` *can* be JSX).
    const statement = {type: 'ExpressionStatement', expression: result}
    state.patch(tree, statement)
    body.push(statement)
  }

  /** @type {Program} */
  const program = {
    type: 'Program',
    body,
    sourceType: 'module',
    comments: state.comments
  }
  state.patch(tree, program)
  return program
}
