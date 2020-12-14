# hast-util-to-estree

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[hast][]** utility to transform a *[tree][]* to **[estree][]** JSX.

## Install

[npm][]:

```sh
npm install hast-util-to-estree
```

## Use

Say we have the following HTML file, `example.html`:

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

And our script, `example.js`, is:

```js
var fs = require('fs')
var parse5 = require('parse5')
var fromParse5 = require('hast-util-from-parse5')
var toEstree = require('hast-util-to-estree')
var recast = require('recast')

var hast = fromParse5(parse5.parse(String(fs.readFileSync('example.html'))))

var estree = toEstree(hast)

var js = recast.prettyPrint(estree).code

console.log(js)
```

Now, `node example` (and prettier), yields:

```jsx
;<>
  <html lang="en">
    <head>
      <title>{'Hi!'}</title>
      <link rel="stylesheet" href="index.css" />
    </head>
    <body>
      <h1>{'Hello, world!'}</h1>
      <a
        download
        style={{
          width: '1',
          height: '10px'
        }}
      />
      {/*commentz*/}
      <svg xmlns="http://www.w3.org/2000/svg">
        <title>{'SVG `<ellipse>` element'}</title>
        <ellipse cx="120" cy="70" rx="100" ry="50" />
      </svg>
      <script src="index.js" />
    </body>
  </html>
</>
```

## API

### `toEstree(tree, options?)`

Transform a **[hast][]** *[tree][]* to an **[estree][]** (JSX).

##### `options`

*   `space` (enum, `'svg'` or `'html'`, default: `'html'`)
    — Whether node is in the `'html'` or `'svg'` space.
    If an `svg` element is found when inside the HTML space, `toEstree`
    automatically switches to the SVG space when entering the element, and
    switches back when exiting

###### Returns

**[estree][]** — a *[Program][]* node, whose last child in `body` is most
likely an `ExpressionStatement` whose expression is a `JSXFragment` or a
`JSXElement`.

Typically, there is only one node in `body`, however, this utility also supports
embedded MDX nodes in the HTML (when [`mdast-util-mdx`][mdast-util-mdx] is used
with mdast to parse markdown before passing its nodes through to hast).
When MDX ESM import/exports are used, those nodes are added before the fragment
or element in body.

###### Note

*   There aren’t many great estree serializers out there that support JSX.
    [recast][] does a great job.
    You can also use [`estree-to-babel`][e2b] to get a Babel AST and then use
    [`@babel/generator`][babel-generator] to serialize JSX
*   Similarly, to turn the JSX into function calls, use [`estree-to-babel`][e2b]
    and then [`@babel/plugin-transform-react-jsx`][react-jsx] (for React)
    or for example [`@vue/babel-plugin-jsx`][vue-jsx] (for Vue), before
    serializing the tree

## Security

You’re working with JavaScript.
It’s not safe.

## Related

*   [`hastscript`][hastscript]
    — Hyperscript compatible interface for creating nodes
*   [`hast-util-from-dom`](https://github.com/syntax-tree/hast-util-from-dom)
    — Transform a DOM tree to hast
*   [`unist-builder`](https://github.com/syntax-tree/unist-builder)
    — Create any unist tree
*   [`xastscript`](https://github.com/syntax-tree/xastscript)
    — Create a xast tree

## Contribute

See [`contributing.md` in `syntax-tree/.github`][contributing] for ways to get
started.
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

[license]: license

[author]: https://wooorm.com

[contributing]: https://github.com/syntax-tree/.github/blob/HEAD/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/HEAD/support.md

[coc]: https://github.com/syntax-tree/.github/blob/HEAD/code-of-conduct.md

[hastscript]: https://github.com/syntax-tree/hastscript

[tree]: https://github.com/syntax-tree/unist#tree

[hast]: https://github.com/syntax-tree/hast

[estree]: https://github.com/estree/estree

[program]: https://github.com/estree/estree/blob/master/es5.md#programs

[recast]: https://github.com/benjamn/recast

[e2b]: https://github.com/coderaiser/estree-to-babel

[babel-generator]: https://babeljs.io/docs/en/babel-generator

[mdast-util-mdx]: https://github.com/syntax-tree/mdast-util-mdx

[react-jsx]: https://babeljs.io/docs/en/babel-plugin-transform-react-jsx

[vue-jsx]: https://github.com/vuejs/jsx-next