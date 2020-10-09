import { LitElement, html } from '/vendor/beaker-app-stdlib/vendor/lit-element/lit-element.js'
import { repeat } from '/vendor/beaker-app-stdlib/vendor/lit-element/lit-html/directives/repeat.js'
import * as contextMenu from '/vendor/beaker-app-stdlib/js/com/context-menu.js'
import { getAvailableName } from '/vendor/beaker-app-stdlib/js/fs.js'
import { pluralize, getOrigin, createResourceSlug } from '/vendor/beaker-app-stdlib/js/strings.js'
import css from '../css/main.css.js'
import './com/blog-feed.js'
import './com/blogpost-view.js'
import './com/blogpost-composer.js'

class ReaderApp extends LitElement {
  static get properties () {
    return {
      session: {type: Object},
      profile: {type: Object},
      suggestedSites: {type: Array},
      composerMode: {type: Boolean},
      currentPost: {type: Object}
    }
  }

  static get styles () {
    return css
  }

  constructor () {
    super()
    this.session = undefined
    this.profile = undefined
    this.suggestedSites = undefined
    this.composerMode = false
    this.currentPost = undefined

    this.configFromQP()
    this.load().then(() => {
      this.loadSuggestions()
    })

    window.addEventListener('popstate', (event) => {
      this.configFromQP()
    })
  }

  configFromQP () {
    // this.currentNav = QP.getParam('view', undefined)
  }

  async load () {
    if (!this.session) {
      this.session = await beaker.session.get()
    }
    if (!this.session) {
      return this.requestUpdate()
    }
    this.profile = this.session.user
    if (this.shadowRoot.querySelector('beaker-blog-feed')) {
      this.shadowRoot.querySelector('beaker-blog-feed').load()
    }
  }

  async loadSuggestions () {
    if (!this.session) return
    const getSite = async (url) => {
      let {site} = await beaker.index.gql(`
        query Site ($url: String!) {
          site(url: $url) {
            url
            title
            description
            subCount: backlinkCount(paths: ["/subscriptions/*.goto"] indexes: ["local", "network"])
          }
        }
      `, {url})
      return site
    }
    let {allSubscriptions, mySubscriptions} = await beaker.index.gql(`
      query Subs ($origin: String!) {
        allSubscriptions: records(paths: ["/subscriptions/*.goto"] limit: 100 sort: crtime reverse: true) {
          metadata
        }
        mySubscriptions: records(paths: ["/subscriptions/*.goto"] origins: [$origin]) {
          metadata
        }
      }
    `, {origin: this.profile.url})
    var currentSubs = new Set(mySubscriptions.map(sub => (getOrigin(sub.metadata.href))))
    currentSubs.add(getOrigin(this.profile.url))
    var candidates = allSubscriptions.filter(sub => !currentSubs.has((getOrigin(sub.metadata.href))))
    var suggestedSiteUrls = candidates.reduce((acc, candidate) => {
      var url = candidate.metadata.href
      if (!acc.includes(url)) acc.push(url)
      return acc
    }, [])
    suggestedSiteUrls.sort(() => Math.random() - 0.5)
    var suggestedSites = await Promise.all(suggestedSiteUrls.slice(0, 12).map(url => getSite(url).catch(e => undefined)))
    suggestedSites = suggestedSites.filter(site => site && site.title)
    if (suggestedSites.length < 12) {
      let {moreSites} = await beaker.index.gql(`
        query { moreSites: sites(indexes: ["network"] limit: 12) { url } }
      `)
      moreSites = moreSites.filter(site => !currentSubs.has(site.url))

      // HACK
      // the network index for listSites() currently doesn't pull from index.json
      // (which is stupid but it's the most efficient option atm)
      // so we need to call getSite()
      // -prf
      moreSites = await Promise.all(moreSites.map(s => getSite(s.url).catch(e => undefined)))
      suggestedSites = suggestedSites.concat(moreSites).filter(Boolean)
    }
    suggestedSites.sort(() => Math.random() - 0.5)
    this.suggestedSites = suggestedSites.slice(0, 12)
  }

  // rendering
  // =

  render () {
    return html`
      <link rel="stylesheet" href="/vendor/beaker-app-stdlib/css/fontawesome.css">
      <nav>
        <div class="brand">
          <h1>Beaker Reader</h1>
          <button class="transparent" @click=${this.onClickDrafts}>Drafts <span class="fas fa-caret-down"></span></button>
          <button class="tooltip-left" data-tooltip="New draft" @click=${e => { this.currentPost = undefined; this.composerMode = true }}>
            <span class="fas fa-edit"></span>
          </button>
        </div>
        ${this.session ? html`
          <beaker-blog-feed current=${this.currentPost?.url} @view-post=${this.onViewPost}></beaker-blog-feed>
        ` : ''}
      </nav>
      <main>
        ${this.composerMode ? html`
          <beaker-blogpost-composer
            .post=${this.currentPost}
            .profile=${this.profile}
            @publish=${this.onComposerPublish}
            @cancel-edit=${this.onComposerCancelEdit}
            @delete=${this.onComposerDelete}
          ></beaker-blogpost-composer>
        ` : this.currentPost ? html`
          <beaker-blogpost-view .post=${this.currentPost} .profile=${this.profile} @edit-post=${this.onEditPost}></beaker-blogpost-view>
        ` : html`
          <div class="empty">
            <h2>Beaker Reader</h2>
            <p>Read and publish blog posts on your network</p>
            ${!this.session ? html`
              <p class="sign-in">
                <button class="primary" @click=${this.onClickSignin}>Sign In</button> to get started
              </p>
            ` : ''}
            ${this.suggestedSites?.length > 0 ? html`
              <h3>Suggested Sites</h3>
              <section class="suggested-sites">
                ${repeat(this.suggestedSites.slice(0, 3), site => html`
                  <div class="site">
                    <div class="title">
                      <a href=${site.url} title=${site.title} target="_blank">${site.title}</a>
                    </div>
                    <div class="subscribers">
                      ${site.subCount} ${pluralize(site.subCount, 'subscriber')}
                    </div>
                    ${site.subscribed ? html`
                      <button class="block transparent" disabled><span class="fas fa-check"></span> Subscribed</button>
                    ` : html`
                      <button class="block" @click=${e => this.onClickSuggestedSubscribe(e, site)}>Subscribe</button>
                    `}
                  </div>
                `)}
              </section>
            ` : ''}
          </div>
        `}
      </main>
    `
  }

  // events
  // =

  onViewPost (e) {
    this.composerMode = false
    this.currentPost = e.detail.post
  }

  onEditPost (e) {
    this.composerMode = true
    this.currentPost = e.detail.post
  }

  async onComposerPublish (e) {
    var {currentPost} = await beaker.index.gql(`
      query Post($url: String!) {
        currentPost: record (url: $url) {
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
          commentCount: backlinkCount(paths: ["/comments/*.md"])
        }
      }
    `, {url: e.detail.url})
    this.currentPost = currentPost
    this.composerMode = false
  }

  onComposerCancelEdit (e) {
    this.composerMode = false
  }

  onComposerDelete (e) {
    location.reload()
  }

  async onClickDrafts (e) {
    e.preventDefault()
    e.stopPropagation()
    var rect = e.currentTarget.getClientRects()[0]

    var {drafts} = await beaker.index.gql(`
      query {
        drafts: records (paths: ["/blog/*.md"] origins: ["hyper://private"] sort: crtime reverse: true) {
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
          commentCount: backlinkCount(paths: ["/comments/*.md"])
        }
      }
    `)
    contextMenu.create({
      x: rect.left,
      y: rect.bottom,
      noBorders: true,
      roomy: true,
      style: `padding: 6px 0`,
      items: drafts.length
        ? drafts.map(draft => ({label: draft.metadata.title, click: () => { this.composerMode = true; this.currentPost = draft }}))
        : [{label: html`<em>No drafts</em>`}]
    })
  }

  async onClickSuggestedSubscribe (e, site) {
    e.preventDefault()
    site.subscribed = true
    this.requestUpdate()

    var drive = beaker.hyperdrive.drive(this.profile.url)
    var slug = createResourceSlug(site.url, site.title)
    var filename = await getAvailableName('/subscriptions', slug, drive, 'goto') // avoid collisions
    await drive.writeFile(`/subscriptions/${filename}`, '', {metadata: {
      href: site.url,
      title: site.title
    }})
    // wait 1s then replace/remove the suggestion
    setTimeout(() => {
      this.suggestedSites = this.suggestedSites.filter(s => s !== site)
    }, 1e3)
  }

  async onClickSignin () {
    await beaker.session.request({
      permissions: {
        publicFiles: [
          {path: '/subscriptions/*.goto', access: 'write'},
          {path: '/blog/*.md', access: 'write'},
          {path: '/comments/*.md', access: 'write'},
          {path: '/votes/*.goto', access: 'write'}
        ],
        privateFiles: [
          {path: '/blog/*.md', access: 'write'}
        ]
      }
    })
    location.reload()
  }
}

customElements.define('reader-app', ReaderApp)
