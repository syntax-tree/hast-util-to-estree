/**
 * @typedef {import('estree').Comment} Comment
 *
 * @typedef {import('estree-jsx').JSXEmptyExpression} JsxEmptyExpression
 * @typedef {import('estree-jsx').JSXExpressionContainer} JsxExpressionContainer
 *
 * @typedef {import('hast').Comment} HastComment
 *
 * @typedef {import('../state.js').State} State
 */

// Make VS Code show references to the above types.
''

/**
 * Turn a hast comment into an estree node.
 *
 * @param {HastComment} node
 *   hast node to transform.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {JsxExpressionContainer}
 *   estree expression.
 */
export function comment(node, state) {
  /** @type {Comment} */
  const result = {type: 'Block', value: node.value}
  state.inherit(node, result)
  state.comments.push(result)

  /** @type {JsxEmptyExpression} */
  const expression = {
    type: 'JSXEmptyExpression',
    // @ts-expect-error: `comments` is custom.
    comments: [Object.assign({}, result, {leading: false, trailing: true})]
  }
  state.patch(node, expression)

  /** @type {JsxExpressionContainer} */
  const container = {type: 'JSXExpressionContainer', expression}
  state.patch(node, container)
  return container
}
