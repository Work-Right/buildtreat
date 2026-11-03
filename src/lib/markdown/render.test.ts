import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
	it('renders paragraphs, emphasis, and lists', () => {
		const html = renderMarkdown('Hello **there** and _you_.\n\n- one\n- two');
		expect(html).toContain('<p>Hello <strong>there</strong> and <em>you</em>.</p>');
		expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
	});

	it('turns single newlines into line breaks', () => {
		expect(renderMarkdown('line one\nline two')).toContain('line one<br>\nline two');
	});

	it('escapes raw html instead of rendering it', () => {
		const html = renderMarkdown('<script>alert(1)</script> <b>bold</b>');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('refuses javascript: and data: links', () => {
		const html = renderMarkdown('[x](javascript:alert(1)) [y](data:text/html,hi)');
		expect(html).not.toContain('href="javascript:');
		expect(html).not.toContain('href="data:');
	});

	it('links bare https urls but not scheme-less domains', () => {
		const html = renderMarkdown('See https://buildersretre.at and example.com');
		expect(html).toContain('<a href="https://buildersretre.at" rel="noopener noreferrer">https://buildersretre.at</a>');
		expect(html).not.toContain('href="http://example.com"');
	});

	it('adds rel to labelled links', () => {
		expect(renderMarkdown('[site](https://buildersretre.at)')).toContain(
			'<a href="https://buildersretre.at" rel="noopener noreferrer">site</a>'
		);
	});

	it('clamps headings to h2 and h3', () => {
		const html = renderMarkdown('# Top\n\n## Mid\n\n#### Deep');
		expect(html).toContain('<h2>Top</h2>');
		expect(html).toContain('<h2>Mid</h2>');
		expect(html).toContain('<h3>Deep</h3>');
		expect(html).not.toMatch(/<h[1456]/);
	});

	it('does not render markdown images', () => {
		const html = renderMarkdown('![alt](https://example.test/x.png)');
		expect(html).not.toContain('<img');
	});

	describe('ledger list items', () => {
		it('turns **Label** — rest into a label/value pair', () => {
			const html = renderMarkdown('- **Fri Dec 4** — Arrive from 3pm, dinner at 7\n- **Sat Dec 5** — Build day');
			expect(html).toContain(
				'<li class="ledger-pair"><span class="ledger-label">Fri Dec 4</span><span class="ledger-value">Arrive from 3pm, dinner at 7</span></li>'
			);
			expect(html).toContain('<span class="ledger-label">Sat Dec 5</span><span class="ledger-value">Build day</span>');
		});

		it('turns Label — rest into an item with an aside', () => {
			expect(renderMarkdown('- Layers — desert nights get cold')).toContain(
				'<li class="ledger-aside"><span class="ledger-label">Layers</span><span class="ledger-value">desert nights get cold</span></li>'
			);
		});

		it('keeps inline markup in the value', () => {
			const html = renderMarkdown('- **Map** — see [the site](https://buildersretre.at) _soon_');
			expect(html).toContain(
				'<span class="ledger-value">see <a href="https://buildersretre.at" rel="noopener noreferrer">the site</a> <em>soon</em></span>'
			);
		});

		it('still escapes html in label and value', () => {
			const html = renderMarkdown('- **<b>x</b>** — <img src=x onerror=alert(1)>\n- <i>y</i> — <script>z</script>');
			expect(html).not.toMatch(/<(b|i|img|script)[\s>]/);
			expect(html).toContain('<span class="ledger-label">&lt;b&gt;x&lt;/b&gt;</span>');
			expect(html).toContain('<span class="ledger-label">&lt;i&gt;y&lt;/i&gt;</span>');
		});

		it('leaves other items alone: hyphens, a missing value, a leading dash, prose outside lists', () => {
			const html = renderMarkdown('- well-known - thing\n- **Only** —\n- — no label\n- plain item\n\nParagraph — with a dash');
			expect(html).not.toContain('ledger');
			expect(html).toContain('<li>plain item</li>');
		});

		it('works in ordered and loose lists', () => {
			expect(renderMarkdown('1. **One** — first\n2. **Two** — second')).toContain('<li class="ledger-pair">');
			expect(renderMarkdown('- **A** — a\n\n- **B** — b')).toContain('<li class="ledger-pair">\n<p><span class="ledger-label">A</span>');
		});
	});
});
