import {css} from '/vendor/beaker-app-stdlib/vendor/lit-element/lit-element.js'
import spinnerCSS from '/vendor/beaker-app-stdlib/css/com/spinner.css.js'
import markdownCSS from '/vendor/beaker-app-stdlib/css/markdown.css.js'

const cssStr = css`
${spinnerCSS}
${markdownCSS}

:host {
  display: block;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.postmeta {
  position: sticky;
  top: 20px;
  z-index: 1;
  background: var(--bg-color--default);
  width: 180px;
  float: right;
  padding: 20px 10px;
  margin: 0 20px 20px;
  text-align: center;
  border: 1px solid var(--border-color--light);
  border-radius: 4px;
  font-size: 15px;
}

.postmeta > * {
  display: block;
}

.postmeta .thumb img {
  width: 80px;
  height: 80px;
  border-radius: 50px;
  object-fit: cover;
}

.postmeta a {
  color: var(--text-color--link);
}

.postmeta .author {
  font-size: 21px;
  font-weight: bold;
  color: inherit;
}

.postmeta .edit {
  margin-top: 5px;
  cursor: pointer;
  font-size: 12px;
}

beaker-record-thread {
  display: block;
  position: initial;
  max-width: 90ch;
  margin: 10px 20px 30px;
}
`
export default cssStr