import MarkdownIt from 'markdown-it';

/**
 * Markdown for organizer-written retreat sections, shared by the server
 * render of `/` and the console's live preview. markdown-it's defaults do
 * the safety work: `html: false` escapes raw HTML and `validateLink`
 * rejects javascript:/vbscript:/file:/data: hrefs. On top of that: no
 * images (photos come from the section's photo list), headings clamped to
 * h2/h3 so a section can't out-rank the page title, and only explicit
 * http(s) URLs auto-link.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
md.disable(['image']);
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

md.core.ruler.push('clamp_headings', (state) => {
	for (const token of state.tokens) {
		if (token.type === 'heading_open' || token.type === 'heading_close') {
			const level = Number(token.tag.slice(1));
			token.tag = level <= 2 ? 'h2' : 'h3';
		}
	}
});

/**
 * Lists are ledgers on the page. A list item written `**Label** — rest`
 * becomes a label/value row (`ledger-pair`: caps label left, value right,
 * like a schedule); `Label — rest` becomes an item with a quieter aside
 * (`ledger-aside`, like a packing list). Only tokens move: the label and
 * value stay text/inline tokens, so everything is still escaped by the
 * normal renderer. The separator is an em dash with spaces around it.
 */
const LEADING_DASH = /^\s*—\s+/;
const LABEL_DASH = /^(.*?\S)\s+—\s+/;

md.core.ruler.push('ledger_items', (state) => {
	const tokens = state.tokens;
	for (let i = 0; i < tokens.length - 2; i++) {
		if (tokens[i].type !== 'list_item_open') continue;
		if (tokens[i + 1].type !== 'paragraph_open' || tokens[i + 2].type !== 'inline') continue;
		const inline = tokens[i + 2];
		// markdown-it may lead with an empty text token before markup.
		const kids = (inline.children ?? []).filter((t, k) => !(k === 0 && t.type === 'text' && t.content === ''));
		let label: string | null = null;
		let rest: typeof kids = [];
		let kind: 'ledger-pair' | 'ledger-aside' = 'ledger-pair';

		const [a, b, c, d] = kids;
		if (
			a?.type === 'strong_open' &&
			b?.type === 'text' &&
			c?.type === 'strong_close' &&
			d?.type === 'text' &&
			LEADING_DASH.test(d.content)
		) {
			label = b.content;
			const tail = new state.Token('text', '', 0);
			tail.content = d.content.replace(LEADING_DASH, '');
			rest = [tail, ...kids.slice(4)];
		} else if (a?.type === 'text') {
			const m = LABEL_DASH.exec(a.content);
			if (m) {
				label = m[1];
				kind = 'ledger-aside';
				const tail = new state.Token('text', '', 0);
				tail.content = a.content.slice(m[0].length);
				rest = [tail, ...kids.slice(1)];
			}
		}
		if (!label?.trim()) continue;
		const restIsEmpty = rest.every((t) => t.type === 'text' && !t.content.trim());
		if (restIsEmpty) continue;

		const span = (cls: string, nesting: 1 | -1) => {
			const t = new state.Token(nesting === 1 ? 'ledger_open' : 'ledger_close', 'span', nesting);
			if (nesting === 1) t.attrSet('class', cls);
			return t;
		};
		const labelText = new state.Token('text', '', 0);
		labelText.content = label;
		inline.children = [
			span('ledger-label', 1),
			labelText,
			span('', -1),
			span('ledger-value', 1),
			...rest.filter((t) => !(t.type === 'text' && t.content === '')),
			span('', -1)
		];
		tokens[i].attrJoin('class', kind);
	}
});

const defaultLinkOpen =
	md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	tokens[idx].attrSet('rel', 'noopener noreferrer');
	return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(src: string): string {
	return md.render(src);
}
