const app = require('../api');
const _ = require('underscore');
const fs = require('fs');
const Journal = require('../models').Journal;
const User = require('../models').User;
const Pub = require('../models').Pub;
const Asset = require('../models').Asset;
const Notification = require('../models').Notification;
import {cloudinary} from '../services/cloudinary';
const Firebase = require('firebase');
import {fireBaseURL, generateAuthToken} from '../services/firebase';

export function createJournal(req, res) {
	Journal.isUnique(req.body.subdomain, (err, result)=>{
		if (!result) { return res.status(500).json('Subdomain is not Unique!'); }

		const journal = new Journal({
			journalName: req.body.journalName,
			subdomain: req.body.subdomain,
			createDate: new Date().getTime(),
			admins: [req.user._id],
			collections: [],
			pubsFeatured: [],
			pubsSubmitted: [],
			design: {
				headerBackground: '#373737',
				headerText: '#E0E0E0',
				headerHover: '#FFF',
				landingHeaderBackground: '#E0E0E0',
				landingHeaderText: '#373737',
				landingHeaderHover: '#000',
			},
		});

		journal.save(function(errSavingJournal, savedJournal) {
			if (err) { return res.status(500).json(err); }
			User.update({ _id: req.user._id }, { $addToSet: { adminJournals: savedJournal._id} }, function(adminAddErr, addAdminResult) {if (adminAddErr) return res.status(500).json('Failed to add as admin'); });

			const journalLandingSlug = savedJournal.subdomain + '-landingpage'; // Guaranteed unique because we don't allow pubs to be created ending with 'landingpage' and subdomain is unique
			const journalLandingTitle = savedJournal.journalName + ' Landing Page';
			Pub.createPub(journalLandingSlug, journalLandingTitle, savedJournal._id, true, function(createErr, savedPub) {

				const ref = new Firebase(fireBaseURL + journalLandingSlug + '/editorData' );
				ref.authWithCustomToken(generateAuthToken(), ()=>{
					const newEditorData = {
						collaborators: {},
						settings: {styleDesktop: ''},
					};
					newEditorData.collaborators[savedJournal.subdomain] = {
						_id: savedJournal._id.toString(),
						name: savedJournal.journalName + ' Admins',
						firstName: savedJournal.journalName || '',
						lastName: 'Admins',
						thumbnail: '/thumbnails/group.png',
						permission: 'edit',
						admin: true,
					};
					ref.set(newEditorData);

					savedJournal.landingPage = savedPub.id;
					savedJournal.save(function(errSavingLanding, savedJournalWithPub) {
						return res.status(201).json(savedJournalWithPub.subdomain);
					});

				});
			});


		});
	});
}
app.post('/createJournal', createJournal);

export function getJournal(req, res) {
	Journal.findOne({subdomain: req.query.subdomain})
	.populate(Journal.populationObject())
	.lean().exec(function(err, result) {

		if (err) { return res.status(500).json(err); }

		let isAdmin = false;
		const userID = req.user ? req.user._id : undefined;
		const adminsLength = result ? result.admins.length : 0;
		for (let index = adminsLength; index--; ) {
			if (String(result.admins[index]._id) === String(userID)) {
				isAdmin = true;
			}
		}

		return res.status(201).json({
			...result,
			isAdmin: isAdmin,
		});
	});
}
app.get('/getJournal', getJournal);

export function getRandomSlug(req, res) {
	Pub.getRandomSlug(req.query.journalID, function(err, result) {
		if (err) {console.log(err); return res.json(500);}
		return res.status(201).json(result);
	});
}
app.get('/getRandomSlug', getRandomSlug);

export function saveJournal(req, res) {
	Journal.findOne({subdomain: req.body.subdomain}).exec(function(err, journal) {
		// console.log('in server save journal');
		// console.log('req.body', req.body);
		// console.log('journal', journal);

		if (err) { return res.status(500).json(err); }

		if (!req.user || String(journal.admins).indexOf(String(req.user._id)) === -1) {
			return res.status(403).json('Not authorized to administrate this Journal.');
		}

		if ('customDomain' in req.body.newObject && req.body.newObject.customDomain !== journal.customDomain) {
			// console.log('we got a new custom domain!');
			Journal.updateHerokuDomains(journal.customDomain, req.body.newObject.customDomain);

		}

		if ('pubsFeatured' in req.body.newObject) {
			// If there are new pubs to be featured, we have to update the pub with a new feature entry
			// We don't have to update any submit entries, as you can't do that from the journal curate page
			const newFeatured = req.body.newObject.pubsFeatured;
			const oldFeatured = journal.pubsFeatured.map((pubID)=>{return String(pubID);});
			const pubsToUpdateFeature = _.difference(newFeatured, oldFeatured);
			for (let index = pubsToUpdateFeature.length; index--;) {
				Pub.addJournalFeatured(pubsToUpdateFeature[index], journal._id, req.user._id);
			}
		}

		for (const key in req.body.newObject) {
			if (req.body.newObject.hasOwnProperty(key)) {
				journal[key] = req.body.newObject[key];
			}
		}

		journal.save(function(errSave, result) {
			if (errSave) { return res.status(500).json(errSave); }

			Journal.populate(result, Journal.populationObject(), function(errPopulate, populatedJournal) {
				return res.status(201).json({
					...populatedJournal.toObject(),
					isAdmin: true,
				});
			});


		});
	});
}
app.post('/saveJournal', saveJournal);

export function submitPubToJournal(req, res) {
	Journal.findOne({_id: req.body.journalID}).exec(function(err, journal) {
		if (err) { return res.status(500).json(err); }

		if (!journal) { return res.status(500).json(err); }

		if ( !journal.autoFeature && (!req.user || String(journal.admins).indexOf(String(req.user._id)) === -1) ) {
			return res.status(403).json('Not authorized to administrate this Journal.');
		}

		if (String(journal.pubsSubmitted).indexOf(req.body.pubID) === -1 && String(journal.pubsFeatured).indexOf(req.body.pubID) === -1) {

			Pub.addJournalSubmitted(req.body.pubID, req.body.journalID, req.user._id);

			if (journal.autoFeature) {
				journal.pubsFeatured.push(req.body.pubID);
				Pub.addJournalFeatured(req.body.pubID, req.body.journalID, null);
			} else {
				journal.pubsSubmitted.push(req.body.pubID);
			}


		}

		journal.save(function(errSave, result) {
			if (errSave) { return res.status(500).json(errSave); }

			Journal.populate(result, Journal.populationObject(), function(errPopulate, populatedJournal) {
				return res.status(201).json({
					...populatedJournal.toObject(),
					isAdmin: true,
				});
			});


		});
	});
}
app.post('/submitPubToJournal', submitPubToJournal);

export function loadJournalAndLogin(req, res) {
	// Load journal Data
	// When an implicit login request is made using the cookie
	// console.time("dbsave");
	Journal.findOne({ $or: [ {subdomain: req.query.host.split('.')[0]}, {customDomain: req.query.host}]})
	.populate(Journal.populationObject())
	.lean().exec(function(err, result) {
		// console.timeEnd("dbsave");
		const journalID = result ? result._id : null;
		Pub.getRandomSlug(journalID, function(errPubSlug, randomSlug) {
			const locale = result && result.locale ? result.locale : 'en';
			let languageObject = {};
			fs.readFile(__dirname + '/../../translations/languages/' + locale + '.json', 'utf8', function(errFSRead, data) {
				if (err) { console.log(err); }
				languageObject = JSON.parse(data);

				const userID = req.user ? req.user._id : undefined;
				Notification.getUnreadCount(userID, function(errNotificationUnread, notificationCount) {
					const loginData = req.user
						? {
							name: req.user.name,
							firstName: req.user.firstName,
							lastName: req.user.lastName,
							username: req.user.username,
							image: req.user.image,
							thumbnail: req.user.thumbnail,
							settings: req.user.settings,
							following: req.user.following,
							notificationCount: notificationCount,
							assets: req.user.assets,
						}
						: 'No Session';

					Asset.find({_id: { $in: loginData.assets } }, function(errAssetFind, assets) {
						if (assets.length) {
							loginData.assets = assets;
						}

						if (result) {
							// If it is a journal, check if the user is an admin.
							let isAdmin = false;
							const resultUserID = req.user ? req.user._id : undefined;
							const adminsLength = result ? result.admins.length : 0;
							for (let index = adminsLength; index--; ) {
								if (String(result.admins[index]._id) === String(resultUserID)) {
									isAdmin = true;
								}
							}

							return res.status(201).json({
								journalData: {
									...result,
									isAdmin: isAdmin,
									randomSlug: randomSlug,
								},
								languageData: {
									locale: locale,
									languageObject: languageObject,
								},
								loginData: loginData,
							});

						}
						// If there was no result, that means we're on pubpub.org, and we need to populate journals and pubs.
						Journal.find({}, {_id: 1, journalName: 1, subdomain: 1, customDomain: 1, pubsFeatured: 1, collections: 1, design: 1}).lean().exec(function(errJournalFind, journals) {
							Pub.find({history: {$not: {$size: 0}}, 'settings.isPrivate': {$ne: true}}, {_id: 1, title: 1, slug: 1, abstract: 1}).lean().exec(function(errPubFind, pubs) {
								// console.log(res);
								return res.status(201).json({
									journalData: {
										...result,
										allJournals: journals,
										allPubs: pubs,
										isAdmin: false,
										// locale: locale,
										// languageObject: languageObject,
										randomSlug: randomSlug,
									},
									languageData: {
										locale: locale,
										languageObject: languageObject,
									},
									loginData: loginData,
								});

							});
						});
					});

				});

			});
		});
	});
}
app.get('/loadJournalAndLogin', loadJournalAndLogin);

export function createCollection(req, res) {
	// return res.status(201).json(['cat','dog']);
	Journal.findOne({subdomain: req.body.subdomain}).exec(function(err, journal) {
		const defaultHeaderImages = [
			'https://res.cloudinary.com/pubpub/image/upload/v1451320792/coll4_ivgyzj.jpg',
			'https://res.cloudinary.com/pubpub/image/upload/v1451320792/coll5_nwapxj.jpg',
			'https://res.cloudinary.com/pubpub/image/upload/v1451320792/coll6_kqgzbq.jpg',
			'https://res.cloudinary.com/pubpub/image/upload/v1451320792/coll7_mrq4q9.jpg',
		];

		const newCollection = {
			title: req.body.newCollectionObject.title,
			slug: req.body.newCollectionObject.slug,
			description: '',
			pubs: [],
			headerImage: defaultHeaderImages[Math.floor(Math.random() * defaultHeaderImages.length)],
		};
		journal.collections.push(newCollection);

		journal.save(function(errSave, savedJournal) {
			if (errSave) { return res.status(500).json(errSave); }

			Journal.populate(savedJournal, Journal.populationObject(true), function(errPopulate, populatedJournal) {
				if (errPopulate) { return res.status(500).json(errPopulate); }

				return res.status(201).json(populatedJournal.collections);
			});

		});
	});
}
app.post('/createCollection', createCollection);

export function saveCollection(req, res) {
	Journal.findOne({subdomain: req.body.subdomain}).exec(function(err, journal) {
		const collections = journal ? journal.collections : [];

		function updateAndSave(cloudinaryURL) {
			for (let index = collections.length; index--;) {
				if (collections[index].slug === req.body.slug) {
					if (cloudinaryURL) {
						journal.collections[index].headerImage = cloudinaryURL;
					}
					for (const key in req.body.newCollectionObject) {
						if (req.body.newCollectionObject.hasOwnProperty(key)) {
							journal.collections[index][key] = req.body.newCollectionObject[key];
						}
					}
					break;
				}
			}
			journal.save(function(errJournalSave, savedJournal) {
				if (errJournalSave) { return res.status(500).json(errJournalSave); }

				Journal.populate(savedJournal, Journal.populationObject(true), function(errJournPopulate, populatedJournal) {
					if (errJournPopulate) { return res.status(500).json(errJournPopulate); }

					return res.status(201).json(populatedJournal.collections);
				});

			});
		}

		if (req.body.newCollectionObject.headerImageURL) {
			cloudinary.uploader.upload(req.body.newCollectionObject.headerImageURL, function(cloudinaryResponse) {
				const cloudinaryURL = cloudinaryResponse.url;
				updateAndSave(cloudinaryURL);

			});
		} else {
			updateAndSave();
		}

	});
}
app.post('/saveCollection', saveCollection);

export function getJournalPubs(req, res) {
	const host = req.headers.host.split(':')[0];
	Journal.findOne({ $or: [ {subdomain: host.split('.')[0]}, {customDomain: host}]})
	.populate(Journal.populationObject(false, true))
	.lean().exec(function(err, journal) {
		return res.status(201).json(journal.pubsFeatured);
	});
}
app.get('/getJournalPubs', getJournalPubs);

export function getJournalCollections(req, res) {
	const host = req.headers.host.split(':')[0];
	Journal.findOne({ $or: [ {subdomain: host.split('.')[0]}, {customDomain: host}]})
	.populate(Journal.populationObject(true, false))
	.lean().exec(function(err, journal) {
		return res.status(201).json(journal.collections);
	});
}
app.get('/getJournalCollections', getJournalCollections);
