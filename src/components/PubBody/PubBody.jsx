import React, {PropTypes} from 'react';
import Radium, {Style} from 'radium';
import {PubSelectionPopup} from '../';
import {globalStyles} from '../../utils/styleConstants';
import { Link } from 'react-router';
import {loadCss} from '../../utils/loadingFunctions';
import {scienceStyle, magazineStyle} from './pubStyles';
import cssConvert from '../../utils/cssToRadium';

let styles = {};

const PubBody = React.createClass({
	propTypes: {
		status: PropTypes.string,
		title: PropTypes.string,
		abstract: PropTypes.string,
		htmlTree: PropTypes.array,
		authors: PropTypes.array,
		addSelectionHandler: PropTypes.func,
		style: PropTypes.object,
	},
	getDefaultProps: function() {
		return {
			htmlTree: [],
			authors: [],
			style: {
				type: 'science',
				googleFontURL: undefined,
				cssObjectString: {},
			},
		};
	},

	getInitialState() {
		return {
			htmlTree: [],
			TOC: [],
		};
	},

	componentDidMount() {
		loadCss(this.props.style.googleFontURL);
	},

	componentWillReceiveProps(nextProps) {
		if (this.props.style.googleFontURL !== nextProps.style.googleFontURL) {
			// console.log('load new fonts!');
			loadCss(nextProps.style.googleFontURL);
		}
	},

	compileStyleRules: function() {
		// console.log('compiling rules');
		
		let cssObject = {};
		switch (this.props.style.type) {
		case 'science':
			cssObject = scienceStyle;
			break;
		case 'magazine': 
			cssObject = magazineStyle;
			break;
		case 'custom': 
			const objectString = this.props.style.cssObjectString || '';
			// const testJSON = objectString.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ');
			// cssObject = JSON.parse('{' + testJSON + '}');
			// cssObject = JSON.parse('{' + objectString.replace(/(['"])?([a-zA-Z0-9_#, -]+)(['"])?:/g, '"$2": ') + '}');
			// console.log('objectString', objectString);
			cssObject = cssConvert(objectString);
			// console.log('cssObject', cssObject);
			break;
		default: 
			cssObject = scienceStyle;
			break;
		}

		const defaultContentRules = {};
		Object.keys(scienceStyle).map((cssRule)=> {
			cssRule.split(',').map((splitRule)=> {
				defaultContentRules['#pubContent ' + splitRule.replace(/ /g, '')] = scienceStyle[cssRule];
			});
		});

		const pubContentRules = {};
		Object.keys(cssObject).map((cssRule)=> {
			cssRule.split(',').map((splitRule)=> {
				pubContentRules['#pubContent ' + splitRule.replace(/ /g, '')] = cssObject[cssRule];
			});
		});

		return ({
			...defaultContentRules, 
			...pubContentRules, 
			'.marking': {
				backgroundColor: 'rgba(124, 235, 124, 0.7)',
			},
			'.tempHighlight': {
				backgroundColor: 'rgba(200,200,200, 0.7)',
			},
			'.selection': {
				backgroundColor: 'rgba(195, 245, 185, 0.7)',
			},
		});
	},

	render: function() {
		// console.log(this.props.htmlTree);
		return (
			<div style={styles.container}>

				<Style rules={this.compileStyleRules()}/>

				<div id="pubContent" style={[styles.contentContainer, styles[this.props.status]]}>

					<div id={'pub-title'}>{this.props.title}</div>
					<div id={'pub-authors'}> <span>by </span>
						{
							this.props.authors.map((author, index)=>{
								return (index === this.props.authors.length - 1
									? <Link to={'/profile/' + author.username} key={'pubAuthorLink-' + index} style={globalStyles.link}><span key={'pubAuthor-' + index} className={'pub-author'}>{author.name}</span></Link>
									: <Link to={'/profile/' + author.username} key={'pubAuthorLink-' + index} style={globalStyles.link}><span key={'pubAuthor-' + index} className={'pub-author'}>{author.name}, </span></Link>);
							})
						}
					</div>
					<div id={'pub-abstract'}>{this.props.abstract}</div>
					<div id={'pub-header-divider'}></div>

					<div id="pubBodyContent">
						{this.props.addSelectionHandler
							? <PubSelectionPopup addSelectionHandler={this.props.addSelectionHandler}/>
							: null
						}
						
						{this.props.htmlTree}
					</div>

				</div>

			</div>
		);
	}
});


styles = {
	container: {
		width: '100%',
		overflow: 'hidden',
		borderRadius: 1,
		// minHeight: 'calc(100vh - 2 * ' + globalStyles.headerHeight + ' + 2px)',
	},
	contentContainer: {
		transition: '.3s linear opacity .25s',
		padding: '0px 10px',
	},
	loading: {
		opacity: 0,
	},
	loaded: {
		opacity: 1
	},

};

export default Radium(PubBody);
