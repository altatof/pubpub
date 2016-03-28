import ImagePlugin 	from './imagePlugin';
import QuotePlugin 	from './quotePlugin';
import VideoPlugin 	from './videoPlugin';
import CitePlugin 	from './citePlugin';
import IframePlugin 	from './iframePlugin';
import SelectionPlugin 	from './selectionPlugin';
import FootnotePlugin 	from './footnotePlugin';

// Page-only Plugins
import pubListPlugin 	from './pubListPlugin';
import collectionListPlugin 	from './collectionListPlugin';

export default {
	image: ImagePlugin,
	quote: QuotePlugin,
	video: VideoPlugin,
	cite: CitePlugin,
	iframe: IframePlugin,
	selection: SelectionPlugin,
	footnote: FootnotePlugin,
	pubList: pubListPlugin,
	collectionList: collectionListPlugin,
};
