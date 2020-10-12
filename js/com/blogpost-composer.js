/* globals beaker monaco */
import { LitElement, html } from '/vendor/beaker-app-stdlib/vendor/lit-element/lit-element.js'
import { unsafeHTML } from '/vendor/beaker-app-stdlib/vendor/lit-element/lit-html/directives/unsafe-html.js'
import { joinPath } from '/vendor/beaker-app-stdlib/js/strings.js'
import { getAvailableName } from '/vendor/beaker-app-stdlib/js/fs.js'
import registerSuggestions from '/vendor/beaker-app-stdlib/js/vs/suggestions.js'
import * as toast from '/vendor/beaker-app-stdlib/js/com/toast.js'
import * as contextMenu from '/vendor/beaker-app-stdlib/js/com/context-menu.js'
import css from '../../css/com/blogpost-composer.css.js'

class BlogpostComposer extends LitElement {
  static get properties () {
    return {
      post: {type: Object},
      placeholder: {type: String},
      currentView: {type: String},
      title: {type: String},
      draftText: {type: String, attribute: 'draft-text'}
    }
  }

  constructor () {
    super()
    this.post = undefined
    this.placeholder = 'Write your blog post here'
    this.currentView = 'edit'
    this.title = ''
    this.draftText = ''
    this.editor = undefined
    this.profile = undefined
    this.lastSavedVersionId = 1
  }

  static get styles () {
    return css
  }

  get isEmpty () {
    return !this.title || !this.draftText
  }

  get isDraft () {
    return !this.post || this.post.site.url === 'hyper://private'
  }

  get hasChanges () {
    var model = this.editor?.getModel()
    return !!model && this.lastSavedVersionId !== model.getAlternativeVersionId()
  }

  async createEditor () {
    return new Promise((resolve, reject) => {
      window.require.config({baseUrl: '/vendor/beaker-app-stdlib/js/'})
      window.require(['vs/editor/editor.main'], () => {
        registerSuggestions()
        var isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
        monaco.editor.defineTheme('custom-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [{ background: '222233' }],
          colors: {'editor.background': '#222233'}
        })
        this.editor = monaco.editor.create(this.shadowRoot.querySelector('.editor'), {
          automaticLayout: true,
          contextmenu: false,
          dragAndDrop: true,
          fixedOverflowWidgets: true,
          folding: false,
          fontSize: '13px',
          lineNumbers: false,
          links: true,
          minimap: {enabled: false},
          model: monaco.editor.createModel(this.draftText, 'markdown'),
          renderLineHighlight: 'none',
          roundedSelection: false,
          theme: isDarkMode ? 'custom-dark' : undefined,
          wordWrap: 'on'
        })
        this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, () => {
          this.onSaveDraft()
        })
        resolve()
      })
    })
  }

  async writePost (isPublic) {
    if (!this.title || !this.draftText) {
      return
    }

    if (!this.profile) {
      throw new Error('.profile is missing')
    }

    var driveUrl = isPublic ? this.profile.url : 'hyper://private'
    var drive = beaker.hyperdrive.drive(driveUrl)
    var title = this.title
    var postBody = this.draftText
    var folder = '/blog/'
    var filename
    
    if (this.post) {
      if (this.isDraft === isPublic) {
        filename = await getAvailableName(folder, title.toLowerCase(), drive, 'md')
      } else {
        filename = this.post.path.split('/').pop()
      }
    } else {
      filename = await getAvailableName(folder, title.toLowerCase(), drive, 'md')
    }

    await drive.writeFile(`${folder}${filename}`, postBody, {metadata: {title}})
    return joinPath(drive.url, `${folder}${filename}`)
  }

  // rendering
  // =

  render () {
    const navItem = (id, label) => html`
      <a
        class=${this.currentView === id ? 'current' : ''}
        @click=${e => { this.currentView = id }}
      >${label}</a>
    `
    return html`
      <link rel="stylesheet" href="/vendor/beaker-app-stdlib/css/fontawesome.css">
      <link rel="stylesheet" href="/vendor/beaker-app-stdlib/js/vs/editor/editor.main.css">
      <form @submit=${this.onPublish}>
        <div class="actions">
          ${this.isDraft ? html`
            <div>
              ${this.post ? html`
                <button class="transparent" @click=${this.onDelete}>Delete Draft</button>
              ` : ''}
            </div>
            <div>
              <button @click=${this.onSaveDraft} ?disabled=${!this.hasChanges}>Save Draft</button>
              <button type="submit" class="primary" ?disabled=${this.isEmpty}>Publish</button>
            </div>
          ` : html`
            <div>
              <button class="transparent" @click=${this.onDelete}>Delete Post</button>
            </div>
            <div>
              <button @click=${this.onCancel}>Cancel</button>
              <button type="submit" class="primary" ?disabled=${!this.hasChanges}>Save Edits</button>
            </div>
          `}
        </div>

        <input
          class="title"
          value=${this.title}
          placeholder="Title"
          required
          @keyup=${this.onKeyupTitle}
        >

        <nav>
          ${navItem('edit', 'Write')}
          ${navItem('preview', 'Preview')}
        </nav>

        <div class="view">
          ${!this.draftText && this.currentView === 'edit' ? html`<div class="placeholder">${this.placeholder}</div>` : ''}
          <div class="editor ${this.currentView === 'edit' ? '' : 'hidden'}" @contextmenu=${this.onContextmenu}></div>
          ${this.currentView === 'preview' ? this.renderPreview() : ''}
        </div>
      </form>
    `
  }

  renderPreview () {
    if (!this.draftText) { 
      return html`<div class="preview"><small><span class="fas fa-fw fa-info"></span> You can use Markdown to format your post.</small></div>`
    }
    return html`
      <div class="preview markdown">
        ${unsafeHTML(beaker.markdown.toHTML(this.draftText))}
      </div>
    `
  }

  async firstUpdated () {
    await this.createEditor()
    this.editor.focus()
    this.editor.onDidChangeModelContent(e => {
      this.draftText = this.editor.getValue()
    })
  }

  async updated (changedProperties) {
    if (changedProperties.has('post') && changedProperties.get('post') != this.post) {
      if (this.post) {
        this.title = this.post.metadata.title
        this.draftText = await beaker.hyperdrive.readFile(this.post.url)
      } else {
        this.title = ''
        this.draftText = ''
      }
      if (this.editor) {
        this.editor.setValue(this.draftText)
      }
      this.lastSavedVersionId = this.editor ? this.editor.getModel().getAlternativeVersionId() : 1
    }
  }
  
  // events
  // =

  onKeyupTitle (e) {
    this.title = e.currentTarget.value
  }

  async onContextmenu (e) {
    e.preventDefault()
    e.stopPropagation()
    contextMenu.create({
      x: e.clientX,
      y: e.clientY,
      noBorders: true,
      style: `padding: 6px 0`,
      items: [
        {label: 'Cut', click: () => {
          this.editor.focus()
          document.execCommand('cut')
        }},
        {label: 'Copy', click: () => {
          this.editor.focus()
          document.execCommand('copy')
        }},
        {label: 'Paste', click: () => {
          this.editor.focus()
          document.execCommand('paste')
        }},
        '-',
        {label: 'Select All', click: () => {
          this.editor.setSelection(this.editor.getModel().getFullModelRange())
        }},
        '-',
        {label: 'Undo', click: () => {
          this.editor.trigger('contextmenu', 'undo')
        }},
        {label: 'Redo', click: () => {
          this.editor.trigger('contextmenu', 'redo')
        }},
      ]
    })
  }

  async onDelete (e) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this post?')) {
      return
    }
    await beaker.hyperdrive.unlink(this.post.url)
    this.dispatchEvent(new CustomEvent('delete'))
  }

  onCancel (e) {
    e.preventDefault()
    e.stopPropagation()
    if (this.hasChanges && !confirm('Discard changes?')) {
      return
    }
    this.draftText = ''
    this.currentView = 'edit'
    this.dispatchEvent(new CustomEvent('cancel-edit'))
  }

  async onSaveDraft (e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    var url = await this.writePost(false)
    if (!this.post) {
      var {post} = await beaker.index.gql(`
        query Post($url: String!) {
          post: record (url: $url) {
            path
            url
            ctime
            mtime
            rtime
            metadata
            site {
              url
              title
            }
          }
        }
      `, {url})
      this.post = post
    }

    toast.create('Draft saved')
    this.lastSavedVersionId = this.editor.getModel().getAlternativeVersionId()
    this.requestUpdate()
  }

  async onPublish (e) {
    e.preventDefault()
    e.stopPropagation()

    var url = await this.writePost(true)
    if (this.post?.url.startsWith('hyper://private/')) {
      // delete draft
      await beaker.hyperdrive.unlink(this.post.url)
    }
    toast.create('Post published')
    
    this.draftText = ''
    this.currentView = 'edit'
    this.dispatchEvent(new CustomEvent('publish', {detail: {url}}))
  }
}

customElements.define('beaker-blogpost-composer', BlogpostComposer)
