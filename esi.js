const reg_esi_tag = /<(esi\:[a-z]+)\b([^>]+[^\/>])?(?:\/|>([\s\S]*?)<\/\1)>/i;
const reg_esi_comments = /<\!--esi\b([\s\S]*?)-->/gi;

function ESI( body, encoding, VARS, isInEsiTag ){
	isInEsiTag = typeof isInEsiTag !== 'undefined' ? isInEsiTag : true;

	if(typeof (body) !== 'string') {
		body = (body || '').toString();
	}

	body = body.replace(reg_esi_comments, '<esi:vars>$1</esi:vars>');

	let parts = splitText( body ).map(function(splittedBody) {
		if(isInEsiTag || splittedBody.match(reg_esi_tag)) {
			return processESITags.bind(VARS)(splittedBody);
		}
		return splittedBody;
	});

	return Promise.all(parts).then(function(response){
		return response.join('');
	});
}

function processESITags(str){
	let m = str.match(reg_esi_tag);

	if( !m ){
		return DictionaryReplace( str, this );
	}

	let tag = m[1];
	let attrs = getAttributes(m[2]);
	let body = m[3];

	switch(tag){
		case 'esi:include':
			return processESIInclude( attrs, body, this );
		case 'esi:try':
			return processESITry( body, this );
		case 'esi:vars':
			return processESIVars( attrs, body, this );
		case 'esi:choose':
			var r = ESI( body, null, this );
			if( this.hasOwnProperty('MATCHES') ){
				delete this.MATCHES;
			}
			return r;
		case 'esi:when':
			if( !this.hasOwnProperty('MATCHES') ){
				const result = processESICondition( attrs.test, this );
				if(result){
					this.MATCHES = result;

					if( attrs.matchname ){
						this[ attrs.matchname ] = result;
					}
					return ESI( body, null, this );
				}
			}
			return '';
		case 'esi:otherwise':
			if( this.hasOwnProperty('MATCHES') ){
				return '';
			}
			return ESI( body, null, this );
		case 'esi:assign':
			this[attrs.name] = processESIExpression( attrs.value, this );
			return '';
		case 'esi:text':

			return body;

		case 'esi:comment':
		case 'esi:remove':
			return '';
	}
	return str;
}

function processESIInclude(attrs, body, VARS) {
	VARS = Object.create(VARS||{});

	if(!attrs.src) {
		return '';
	}

	let src = attrs.src;
	return new Promise(function( resolve, reject ){
		let src = DictionaryReplace( attrs.src, VARS );
		makeRequest( src, resolve, reject );
	})
	.then(
		null,
		function(err) {
			if(attrs.alt) {
				return new Promise( function( resolve, reject ){
					src = DictionaryReplace( attrs.alt, VARS );
					makeRequest( src, resolve, reject );

				});
			}
			throw err;
		}
	)
	.then(function(body) {
			if(attrs.dca === 'esi'){
				return ESI(body, null, VARS);
			}
			else {
				return body;
			}

		},
		function(err){
			if( attrs.onerror === "continue" ){
				return '';
			}
			else{
				throw err;
			}
		}
	);
}

function processESITry( body, VARS ){
	let parts = splitText( body ),
		attempt,
		except;

	for(let i = 0; i < parts.length; i++) {
		let str = parts[i];
		let m = str.match(reg_esi_tag);
		let tag = m && m[1];

		if(tag === 'esi:attempt') {
			attempt = m[3];
		}
		else if (tag === 'esi:except') {
			except = m[3];
		}
	}

	return ESI(attempt, null, VARS).then(null, function() {
		return ESI(except, null, VARS);

	});
}

function processESIVars(attrs, body, VARS){
	if(!body && attrs.name) {
		return DictionaryReplace( attrs.name, VARS );
	}
	return ESI(body, null, VARS);
}

const reg_trim = /(^\s+|\s+$)/;
const reg_esi_condition = /^(.*?)\s+(=|==|<=|>=|matches|matches_i|has|has_i)\s+('''|)(.*?)\3$/;
const reg_esi_condition_separator = /\s+(\|\||\&\&)\s+/g;

function processESICondition(test, VARS) {
	let tests = test.split(reg_esi_condition_separator);
	let bool, matches;

	for (let i = 0;i < tests.length; i++ ) {
		test = tests[i].replace(reg_trim,'');

		if( test === '&&' && bool === false ){
			break;
		}
		else if ( test === '||' && bool === true ){
			break;
		}

		let negatory = test[0] === '!';
		test.replace(/^\!/,'');

		let m = test.match(reg_esi_condition);

		if(!m) {
			bool = !!DictionaryReplace( test, VARS );
		}
		else {
			let a = DictionaryReplace( m[1], VARS );
			let operator = m[2];
			let b = DictionaryReplace( m[4], VARS );

			switch(operator){
				case '=':
				case '==':
				case '===':
					bool = a === b;
					break;
				case '!=':
				case '!==':
					bool = a !== b;
					break;
				case '>=':
					bool = a >= b;
					break;
				case '<=':
					bool = a <= b;
					break;
				case 'has':
					bool = a.indexOf(b) > -1;
					break;
				case 'has_i':
					bool = a.toLowerCase().indexOf(b.toLowerCase()) > -1;
					break;
				case 'matches':
				case 'matches_i':
					var reg = new RegExp( b, operator === 'matches_i' ? 'i' : '' );
					matches = a.match(reg);
					bool = !!matches;
					break;
			}
		}

		bool = negatory ^ bool;
	}

	return bool ? matches || true : false;
}

function processESIExpression(txt, VARS){
	if(!txt && txt.length === 0) {
		return '';
	}
	else if (txt[0]==="'"){
		return txt.replace(/^\'|\'$/g,'');
	}
	return DictionaryReplace( txt, VARS );

}

function makeRequest(url, resolve, reject) {
	$.get( url, function(res) {
        resolve(res);
	}).fail(function(e){
	    reject(url);
	});
}

const reg_esi_tag_global = new RegExp(reg_esi_tag.source, 'gi');

function splitText(str){
	let i=0,
		m,
		r=[];

	while((m = reg_esi_tag_global.exec(str))) {
		r.push(str.slice(i,m.index));
		i = m.index+m[0].length;
		r.push(m[0]);
	}
	r.push(str.slice(i,str.length));
	return r;
}

const reg_attrs = /\b([^\s=]+)(=(('|")(.*?[^\\]|)\4|[^\s]+))?/ig;

function getAttributes(str, undefined) {
	var m, r= {};
	while((m = reg_attrs.exec(str))){
		r[m[1]] = (m[5] !== undefined ? m[5] : m[3]);
	}
	return r;
}

const reg_esi_variable = /\$\((.*?)(?:\{([\d\w]+)\})?\)/g;

function DictionaryReplace(str, hash) {
	return str.replace( reg_esi_variable, function (m, key, subkey){
		if(key in hash){
			var val = hash[key];
			if( subkey ){
				val = val instanceof Object ? val[subkey] : '';
			}
			return val === undefined ? '' : val;
		}
		return '';
	});
}

$(document).ready(function () {
    const bodyHtml = $('body').html();
    ESI(bodyHtml).then(function (newHtml) {
        $('body').html(newHtml);
    }).catch(function () {
        // do nothing for now
    });
});