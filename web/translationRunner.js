const fs = require('fs');
const path = require('path');
const beautify = require('json-beautify');
const merge = require('lodash.merge');
const isEmpty = require('lodash.isempty');
const flatten = require('flat');
const glob = require('glob');

const PLACEHOLDER_REGEX = /[^{}]+(?=})/g;
const LETTER_REGEX = /[a-zA-Z]/g;
const ERRORS = {
	SIGN: '___ERROR:',
	get PLACE_HOLDERS() {
		return `${this.SIGN} INVALID PLACEHOLDER`;
	},
	get NOT_TRANSLATED() {
		return `${this.SIGN} THE STRING IS NOT TRANSLATED`;
	},
};

const LANG_PATTERN = 'src/config/lang/**.json';

const getTranslations = async (diff, lang) => {
	// translation request and response manipulation
	await new Promise((resolve) => setTimeout(resolve, 3000));
	return diff;
};

const removeError = (string = '') => string.split(ERRORS.SIGN)[0];

const dropPlaceholders = (string = '') =>
	string.replace(PLACEHOLDER_REGEX, '').replace(/{}/g, '').trim();

const hasLetters = (string = '') => LETTER_REGEX.test(string);

const equalityCheck = (base, target) =>
	has('--ignore-equals')
		? false
		: base === target && hasLetters(dropPlaceholders(base));

const validatePlaceholder = (string) => !isNaN(Number(string));

const validatePlaceholders = (matches = []) => {
	let isValid = true;
	if (!matches) {
		return isValid;
	} else {
		matches.forEach((match) => {
			if (!validatePlaceholder(match)) {
				isValid = false;
			}
		});
		return isValid;
	}
};

const pushError = (string, error) => `${string} ${error}`;

const saveFile = (output, content) => {
	fs.writeFileSync(output, beautify(content, null, 4, 100));
};

const readFile = (pathname) => {
	try {
		const contents = fs.readFileSync(pathname, 'utf-8');
		return JSON.parse(contents);
	} catch (err) {
		console.log(err);
		return {};
	}
};

const getPlaceHolders = (string = '') => string.match(PLACEHOLDER_REGEX);

const countPlaceholders = (matches) => (matches ? matches.length : 0);

const validateString = (base, target) => {
	const benchmarkPlaceholdersCount = countPlaceholders(getPlaceHolders(base));
	const placeholders = getPlaceHolders(target);

	return (
		countPlaceholders(placeholders) === benchmarkPlaceholdersCount &&
		validatePlaceholders(placeholders)
	);
};

const lang = process.env.REACT_APP_LANG;
const baseLangDir = './src/config/lang/en.json';
const targetLangDir = `./src/config/lang/${lang}.json`;
const diffDir = './diff.json';

const isObject = (input) =>
	typeof input === 'object' && !Array.isArray(input) && input !== null;

const isString = (input) =>
	typeof input === 'string' || input instanceof String;

const has = (input) => process.argv.includes(input);

const compare = (base = {}, target = {}) => {
	const diff = {};
	Object.entries(base).forEach(([key, value]) => {
		if (!target || !target.hasOwnProperty(key) || !target[key]) {
			diff[key] = value;
		} else {
			if (isObject(value)) {
				if (isObject(target[key])) {
					const comparisonResult = compare(value, target[key]);
					if (!isEmpty(comparisonResult)) {
						diff[key] = comparisonResult;
					}
				} else {
					diff[key] = value;
				}
			} else if (isString(value)) {
				if (isString(target[key])) {
					if (!validateString(value, target[key])) {
						diff[key] = pushError(value, ERRORS.PLACE_HOLDERS);
					} else if (equalityCheck(value, target[key])) {
						diff[key] = pushError(value, ERRORS.NOT_TRANSLATED);
					}
				}
			}
		}
	});

	return diff;
};

const manipulateObject = (object = {}, cb) => {
	const result = {};
	Object.entries(object).forEach(([key, value]) => {
		if (isObject(value)) {
			result[key] = manipulateObject(value, cb);
		} else if (isString(value)) {
			result[key] = cb(value);
		}
	});

	return result;
};

const reverseCheck = (base = {}, target = {}) => {
	const cleanedTarget = { ...target };
	Object.entries(target).forEach(([key, value]) => {
		if (!base.hasOwnProperty(key)) {
			delete cleanedTarget[key];
		} else if (isObject(value)) {
			reverseCheck(base[key], value);
		}
	});

	return cleanedTarget;
};

const autoTranslate = async (targetLangDir, targetLang) => {
	const exceptions = [
		'HOUR_FORMAT',
		'DEFAULT_TIMESTAMP_FORMAT',
		'TIMESTAMP_FORMAT',
	];
	const diff = compare(readFile(baseLangDir), readFile(targetLangDir));
	const diff_no_error = manipulateObject(diff, removeError);

	Object.keys(diff_no_error).forEach((key) => {
		if (exceptions.includes(key)) {
			delete diff_no_error[key];
		}
	});
	const options = { safe: true };
	const translations = await getTranslations(
		flatten(diff_no_error, options),
		targetLang
	);
	const content = merge(
		{},
		readFile(targetLangDir),
		flatten.unflatten(translations, options)
	);
	saveFile(targetLangDir, content);
};

if (has('--translate-all')) {
	const langs = glob.sync(LANG_PATTERN);

	langs
		.filter((langDir) => !baseLangDir.includes(langDir))
		.forEach(async (targetLangDir) => {
			const fileName = targetLangDir
				.split(path.sep)
				.find((text) => text.includes('json'));
			const [lang] = fileName.split('.');
			await autoTranslate(targetLangDir, lang);
		});
} else {
	if (!lang) {
		console.error('No language given');
		process.exit(1);
	}

	if (has('--save-diff')) {
		const diff = compare(readFile(baseLangDir), readFile(targetLangDir));
		saveFile(`diff.json`, diff);
	}

	if (has('--merge-diff')) {
		const diff = manipulateObject(readFile(diffDir), removeError);
		const content = merge({}, readFile(targetLangDir), diff);
		saveFile(targetLangDir, content);
	}

	if (has('--reverse-check')) {
		const cleanedLanguageFile = reverseCheck(
			readFile(baseLangDir),
			readFile(targetLangDir)
		);
		saveFile(targetLangDir, cleanedLanguageFile);
	}

	if (has('--auto-translate')) {
		autoTranslate(targetLangDir, lang);
	}
}
