# hast-util-to-estree

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to transform to [estree][] (JSX).

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`toEstree(tree[, options])`](#toestreetree-options)
    *   [`defaultHandlers`](#defaulthandlers)
    *   [`ElementAttributeNameCase`](#elementattributenamecase)
    *   [`Handle`](#handle)
    *   [`Options`](#options)
    *   [`Space`](#space)
    *   [`State`](#state)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility that takes a [hast][] (HTML) syntax tree as input and
turns it into an [estree][] (JavaScript) syntax tree (with a JSX extension).
This package also supports embedded MDX nodes.

## When should I use this?

This project is useful when you want to embed HTML as JSX inside JS while
working with syntax trees.
This is used in [MDX][].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install hast-util-to-estree
```

In Deno with [`esm.sh`][esmsh]:

```js
import {toEstree} from 'https://esm.sh/hast-util-to-estree@2'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {toEstree} from 'https://esm.sh/hast-util-to-estree@2?bundle'
</script>
```

## Use

Say our module `example.html` contains:

```html
<!doctype html>
<html lang=en>
<title>Hi!</title>
<link rel=stylesheet href=index.css>
<h1>Hello, world!</h1>
<a download style="width:1;height:10px"></a>
<!--commentz-->
<svg xmlns="http://www.w3.org/2000/svg">
  <title>SVG `&lt;ellipse&gt;` element</title>
  <ellipse
    cx="120"
    cy="70"
    rx="100"
    ry="50"
  />
</svg>
<script src="index.js"></script>
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromHtml} from 'hast-util-from-html'
import {toEstree} from 'hast-util-to-estree'
import {toJs, jsx} from 'estree-util-to-js'

const hast = fromHtml(await fs.readFile('example.html'))

const estree = toEstree(hast)

console.log(toJs(estree, {handlers: jsx}).value)
```

…now running `node example.js` (and prettier) yields:

```jsx
/* Commentz */
;<>
  <html lang="en">
    <head>
      <title>{'Hi!'}</title>
      {'\n'}
      <link rel="stylesheet" href="index.css" />
      {'\n'}
    </head>
    <body>
      <h1>{'Hello, world!'}</h1>
      {'\n'}
      <a
        download
        style={{
          width: '1',
          height: '10px'
        }}
      />
      {'\n'}
      {}
      {'\n'}
      <svg xmlns="http://www.w3.org/2000/svg">
        {'\n  '}
        <title>{'SVG `<ellipse>` element'}</title>
        {'\n  '}
        <ellipse cx="120" cy="70" rx="100" ry="50" />
        {'\n'}
      </svg>
      {'\n'}
      <script src="index.js" />
      {'\n'}
    </body>
  </html>
</>
```

## API

This package exports the identifiers [`defaultHandlers`][defaulthandlers] and
[`toEstree`][toestree].
There is no default export.

### `toEstree(tree[, options])`

Transform a hast tree (with embedded MDX nodes) into an estree (with JSX
nodes).

###### Notes

Comments are attached to the tree in their neighbouring nodes (`recast`,
`babel` style) and also added as a `comments` array on the program node
(`espree` style).
You may have to do `program.comments = undefined` for certain compilers.

###### Parameters

*   `tree` ([`HastNode`][hast-node])
    — hast tree
*   `options` ([`Options`][options], optional)
    — configuration

###### Returns

estree program node ([`Program`][program]).

The program’s last child in `body` is most likely an `ExpressionStatement`,
whose expression is a `JSXFragment` or a `JSXElement`.

Typically, there is only one node in `body`, however, this utility also supports
embedded MDX nodes in the HTML (when [`mdast-util-mdx`][mdast-util-mdx] is used
with mdast to parse markdown before passing its nodes through to hast).
When MDX ESM import/exports are used, those nodes are added before the fragment
or element in body.

There aren’t many great estree serializers out there that support JSX.
To do that, you can use [`estree-util-to-js`][estree-util-to-js].
Or, use [`estree-util-build-jsx`][build-jsx] to turn JSX into function
calls, and then serialize with whatever (`astring`, `escodegen`).

### `defaultHandlers`

Default handlers for elements (`Record<string, Handle>`).

Each key is a node type, each value is a [`Handle`][handle].

### `ElementAttributeNameCase`

Specify casing to use for attribute names (TypeScript type).

React casing is for example `className`, `strokeLinecap`, `xmlLang`.
HTML casing is for example `class`, `stroke-linecap`, `xml:lang`.

###### Type

```ts
type ElementAttributeNameCase = 'react' | 'html'
```

### `Handle`

Turn a hast node into an estree node (TypeScript type).

###### Parameters

*   `node` ([`HastNode`][hast-node])
    — expected hast node
*   `state` ([`State`][state])
    — info passed around about the current state

###### Returns

JSX child (`JsxChild`, optional).

You can also add more results to `state.esm` and `state.comments`.

### `Options`

Configuration (TypeScript type).

###### Fields

*   `elementAttributeNameCase`
    ([`ElementAttributeNameCase`][api-element-attribute-name-case], default:
    `'react'`)
    — specify casing to use for attribute names; this casing is used for hast
    elements, not for embedded MDX JSX nodes (components that someone authored
    manually)
*   `handlers` (`Record<string, Handle>`, optional)
    — custom handlers
*   `space` ([`Space`][space], default: `'html'`).
    which space the document is in; when an `<svg>` element is found in the
    HTML space, this package already automatically switches to and from the SVG
    space when entering and exiting it

### `Space`

Namespace (TypeScript type).

###### Type

```ts
type Space = 'html' | 'svg'
```

### `State`

Info passed around about the current state (TypeScript type).

###### Fields

*   `schema` ([`Schema`][schema])
    — current schema
*   `elementAttributeNameCase`
    ([`ElementAttributeNameCase`][api-element-attribute-name-case])
    — casing to use for attribute names
*   `comments` (`Array<EstreeComment>`)
    — list of estree comments
*   `esm` (`Array<EstreeNode>`)
    — list of top-level estree nodes
*   `handle` (`(node: HastNode) => EstreeJsxChild | void`)
    — transform a hast node to estree
*   `handle` (`(node: HastParent) => EstreeJsxChild | void`)
    — transform children of a hast parent to estree
*   `patch` (`(from: HastNode, to: EstreeNode) => void`)
    — take positional info from `from` (use `inherit` if you also want data)
*   `inherit` (`(from: HastNode, to: EstreeNode) => void`)
    — take positional info and data from `from` (use `patch` if you don’t want
    data)
*   `createJsxAttributeName` (`(name: string) => EstreeJsxAttributeName`)
    — create a JSX attribute name
*   `createJsxElementName` (`(name: string) => EstreeJsxElementName`)
    — create a JSX attribute name

## Types

This package is fully typed with [TypeScript][].
It exports the additional types
[`ElementAttributeNameCase`][api-element-attribute-name-case],
[`Handle`][handle], [`Options`][options],
[`Space`][space], and [`State`][state].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

You’re working with JavaScript.
It’s not safe.

## Related

*   [`hastscript`][hastscript]
    — hyperscript compatible interface for creating nodes
*   [`hast-util-from-dom`](https://github.com/syntax-tree/hast-util-from-dom)
    — transform a DOM tree to hast
*   [`estree-util-build-jsx`][build-jsx]
    — transform JSX to function calls

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
ways to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/syntax-tree/hast-util-to-estree/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hast-util-to-estree/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hast-util-to-estree.svg

[coverage]: https://codecov.io/github/syntax-tree/hast-util-to-estree

[downloads-badge]: https://img.shields.io/npm/dm/hast-util-to-estree.svg

[downloads]: https://www.npmjs.com/package/hast-util-to-estree

[size-badge]: https://img.shields.io/bundlephobia/minzip/hast-util-to-estree.svg

[size]: https://bundlephobia.com/result?p=hast-util-to-estree

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/syntax-tree/unist/discussions

[npm]: https://docs.npmjs.com/cli/install

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[esmsh]: https://esm.sh

[typescript]: https://www.typescriptlang.org

[license]: license

[author]: https://wooorm.com

[health]: https://github.com/syntax-tree/.github

[contributing]: https://github.com/syntax-tree/.github/blob/main/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/main/support.md

[coc]: https://github.com/syntax-tree/.github/blob/main/code-of-conduct.md

[hastscript]: https://github.com/syntax-tree/hastscript

[hast]: https://github.com/syntax-tree/hast

[hast-node]: https://github.com/syntax-tree/hast#nodes

[estree]: https://github.com/estree/estree

[program]: https://github.com/estree/estree/blob/master/es5.md#programs

[estree-util-to-js]: https://github.com/syntax-tree/estree-util-to-js

[mdast-util-mdx]: https://github.com/syntax-tree/mdast-util-mdx

[build-jsx]: https://github.com/wooorm/estree-util-build-jsx

[schema]: https://github.com/wooorm/property-information#api

[mdx]: https://mdxjs.com

[defaulthandlers]: #defaulthandlers

[toestree]: #toestreetree-options

[api-element-attribute-name-case]: #elementattributenamecase

[space]: #space

[options]: #options

[handle]: #handle

[state]: #state
