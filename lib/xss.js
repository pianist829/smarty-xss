'use strict';

module.exports = {
    config : function(options){
        xss.config(options);
    },
    repair : function(content){ 
        var result = xss.parse(content, true);
        return result['content'];
    },
    check : function(content){
        var result = xss.parse(content, false);
        return result['error'];
    }
};
var xss = new XSS(),
    _ = require('./util.js'),
    analytihtml = require('./analytichtml.js'),
    analyticjs = require('./analyticjs.js');

function XSS(){
    /**
     * 校验修复内容
     * @type {String}
     */
    this.fileContent = '';
    /**
     * smarty模板左定界符，默认为<&
     * @type {String}
     */
	this.leftDelimiter = '<&';
    /**
     * smarty模板右定界符,默认为&>
     * @type {String}
     */
	this.rightDelimiter = '&>';
    /**
     * 变量白名单，不需要进行转义的
     * @type {Array}
     */
	this.xssSafeVars = [];
    /**
     * 转义类型
     * @type {Array}
     */
    this.escapeMap = [];
    this.pattern = '';
    /**
     * 是否进行XSS自动修复
     * @type {Boolean}
     */
	this.isXssAutoFixed = true;
    
	/**
	 * XSS转义冲突列表
	 */
    this.modifier_conflict_map = {
        'data' : ['js', 'html'],
        'path' : ['html']
    };
	
    /**
     * XSS结果
     * @var type XSS结果
     */
    this.xss_result = {
        'error' : [],
        'content' : '',
        'realContent' : ''
    };

    this._white_operators = ["+" ,"-","*","/","="];
}
XSS.prototype.init = function(){
    /**
     * XSS自动修复所需变量
     * @type {Object}
     */
	this.xss_auto_fixed = {
		//当前解析到的文件的内容
		'cur_file_content'	: '',
		//当前正在解析的块儿内容（原内容）
		'cur_parse_raw_content'	: '',
		//当前正在解析的块儿内容
		'cur_parse_content'	: '',
		//当前正在解析的语句原内容
		'cur_parse_raw_sentence'	: '',
		//当前正在解析的原内容
		'cur_parse_sentence'	: '',
		//记录语句块儿被替换的次数
		'stt_replace_time'	: 0,
		//语句在内容块中出现的次数
		'sentence_in_content' : [],
		//内容在文件中出现的次数
		'content_in_file'	: [],
		//记录内容块儿被替换的次数
		'ctt_replace_time'	: 0,
		//记录当前UI变量需要增加的escapse方式，如"|sp_escapse_js"
		'tpl_replace_str_add'		: '',
		//记录当前UI变量需要去掉的escapse方式，如"|sp_escapse_js"
		'tpl_replace_str_del'		: '',
		//某模板中XSS漏洞的个数
		'xss_num'			: 0,
		//模板变量的正则
		'tpl_var_pattern'	: '',
		//标记当前解析到的内容中是否含有xss
		'has_xss_in_cur_content' : false,
        //转义中，重复的，应该被删掉的，不能共存的，比如js和data转义同时存在时，删掉js转义
        'duplicated_escape' : false
    };
};


/**
 * 设置参数 fileContent, xssSafeVars, isXssAutoFixed, escapeMap, leftDelimiter, rightDelimiter
 * @param options
 */
XSS.prototype.config = function(options){
    for(var key in options){
        if(options.hasOwnProperty(key)){
            this[key] = options[key]
        }
    }
};

/**
 * 解析内容
 * @param content
 * @param isXssAutoFixed
 * @return {*}
 */
XSS.prototype.parse = function(content, isXssAutoFixed){
    this.init();
    this.fileContent = content.toString();
    this.isXssAutoFixed = isXssAutoFixed;
    //需要对正则处理
    this.pattern =  _.preg_quote(this.leftDelimiter, '/') + '\\s*\\$(.*?)\\s*'
                      + _.preg_quote(this.rightDelimiter, '/');
    this.xss_auto_fixed['tpl_var_pattern'] = '/(\\[^\\|]+)(.*?)/ies';
    this._xss_result = {
        'error' : [],
        'content' : ''
    };
    //获取模板内容
    this.xss_auto_fixed['cur_file_content'] = this.fileContent;

    //XSS自动修复
    if(this.isXssAutoFixed){
        //解析每个模板之前，需要重置一些变量
        this.xss_auto_fixed['xss_num'] = 0;
    }
    this.check_single_file();
    //返回结果
    this._xss_result['content'] = this.xss_auto_fixed['cur_file_content'];
    this._xss_result['realContent'] = this.delNoEscape(this.xss_auto_fixed['cur_file_content']);
    return this._xss_result;
};
   
XSS.prototype.check_single_file = function(){
    var content = this.fileContent;
    var analytic_content = analytihtml.parse(content, 1, this.leftDelimiter, this.rightDelimiter); 

    //如果不是一个html文档，一般都是异步数据接口
    if (this.check_is_html(analytic_content, content)){ 
        for(var i = 0; i < analytic_content.length; i++){
            var item = analytic_content[i];
            //记录当前正在处理的内容
            this._markCurParseContent(item[0]);
            if (item[1] === _.sign.HTML_TAG_START || item[1] === _.sign.HTML_CSS_CONTENT){
                var tag_info = analytihtml.parse(item[0], 2, this.leftDelimiter, this.rightDelimiter); 
                for(var j = 0; j < tag_info[2].length; j++){
                    var attrs = tag_info[2][j];
                    if (attrs[1] && String(attrs[0]).indexOf('on') === 0){//event
                        this._check_it(attrs[1], 'event');
                    }else if(attrs[0] == 'src' || attrs[0] == 'href' || 
                            (tag_info[1].toLowerCase() == "form" && attrs[0] == 'action')){ //url
                        this._check_it(attrs[1], 'path');
                    }else{
                        this._check_it(attrs[1] ? attrs[1] : attrs[0], 'html');
                    }
                }
            }else if(item[1] === _.sign.HTML_JS_CONTENT && item[0].trim()){
                this.check_js_content(item[0].trim(), 'js');
            }else if(item[1] === _.sign.HTML_XML){
                // todo...
            }else{
                this._check_it(item[0], 'html');
            }
        }
    }else{
        // 这种情况下，一定是一个异步模板：需要进行data转义
        this.check_js_content(content, 'data');
    }
};

/**
 * 检测JS的内容转义
 * @param content
 * @param type
 */
XSS.prototype.check_js_content = function(content, type){
    var analytic_content = analyticjs.parse(content, this.leftDelimiter, this.rightDelimiter);
    var self = this;
    analytic_content.forEach(function(item){
        if (item[1] === _.sign.FL_TPL_DELIMITER || item[1] === _.sign.JS_STRING){
            //记录当前正在处理的内容
            self._markCurParseContent(item[0]);
            self._check_it(item[0], type ? type : 'js');
        }
    });
};

/**
 *  检测内容真的是html,主要是判断内容中是否至少含有一个标签
 * 这种判断方式并不完全安全。（有可能异步接口里含有标签，但概率较小。没想到其他更好的判断方式）
 * 
 * XML也是一种特殊的HTML
 * @param analytic_content
 * @param content
 * @return {Boolean}
 */
XSS.prototype.check_is_html = function(analytic_content, content){
    var tag = [];
    for (var i=0 ;i < analytic_content.length; i++){
        var item = analytic_content[i];
        if (item[1] === _.sign.HTML_XML || item[1] === _.sign.HTML_JS_START || item[1] === _.sign.HTML_JS_END){
            return true;
        }
        //只检测tag_start即可
        if(item[1] === _.sign.HTML_TAG_START){
            if (i > 0){
                var preItem = analytic_content[i-1];
                if (preItem[1] === _.sign.HTML_CONTENT){
                    var preString = preItem[0].trim();
                    //获取上一个特征值的最后一个字符
                    var preLastChar = preString[preString.length - 1];
                    //异步接口里可能也含有一些标签，但这些标签都用引号包含起来了。
                    if (preLastChar === '"' || preLastChar === "'"){
                        continue;
                    }
                }
            }
            tag.push(item[0]);
            //如果多余5个标签认为是html
            if (tag.length >= 5){
                return true;
            }
        }
    }
    //检测有标签但小于5个，这时候用js类型分析
    if (tag.length > 0 && tag.length < 5){
        analytic_content = analyticjs.parse(content, this.leftDelimiter, this.rightDelimiter);
        for(var i = 0; i < analytic_content.length; i++){
            if (tag.length === 0) return false;
            item = analytic_content[i];
            if (item[1] === _.sign.JS_STRING){
                var notFilte = [];
                var findPos = [];
                tag.forEach(function(t){
                    var pos = 0;
                    while (true){
                        pos = String(item[0]).indexOf(t, pos);
                        if (pos === -1){
                            notFilte.push(t);
                            break;
                        }else{
                            if (!_.in_array(pos, findPos)){
                                findPos.push(pos);
                                break;
                            }else {
                                pos += t.length;
                            }
                        }
                    }
                });
                tag = notFilte;
            }
        }
        if (tag.length > 0) return true;
    }
    return false;
};

/**
 * 检测每个smarty变量转义是否正确
 * @param content 校验内容
 * @param type 类型
 * @private
 */
XSS.prototype._check_it = function(content, type){
    this.xss_auto_fixed['sentence_in_content'] = [];

    //记录当前解析的语句在内容块中出现的次数
    this._markSentenceInContent(content);

    //寻找模板变量
    var matches = content.match(new RegExp(this.pattern,'g'));
    if(!matches){return}
    var wraperContent = content;
    var pattern = this.pattern;
    var index = -1;
    var originType = type;
    for(var i = 0; i < matches.length; i++){
        content = matches[i];
        var p = new RegExp(pattern,'g');
        var r = p.exec(content);
        var value = r[1];
        index++;
        type = originType;
        
        value = this.repairPregReplace(value).trim();
        var lv = value.toLowerCase();
            
        if (lv.indexOf('smarty.get.callback') !== -1 
            || lv.indexOf('smarty.post.callback') !== -1 
            || lv.indexOf('spcallback') !== -1){
            
            type = 'callback';
        }
        if (value.indexOf('smarty.foreach') !== -1 //smarty本身的
            || value.indexOf('smarty.capture') !== -1
            || value.indexOf('smarty.now') !== -1
            || value.indexOf('smarty.section') !== -1
            || value.indexOf('smarty.block') !== -1
            || value.indexOf('smarty.const') !== -1
            || value.indexOf('smarty.capture') !== -1
            || this.escapeMap['path'] 
                && value.indexOf(this.escapeMap['path']) !== -1 //已经使用了path进行了url转义
            || this.escapeMap['no_escape'] 
                && value.indexOf(this.escapeMap['no_escape']) !== -1 //已经标示成了不需要转义
            || value.indexOf('|date_format') !== -1 //格式化日期
            || /escape:("|\'?)url\1/i.test(value) //已经使用了escape:url进行了url转义，rawurlencode()
            || /escape:("|\'?)none\1/i.test(value) //已经使用了escape:none的，就不进行转义了
            || /string_format:("|\'?)[\w \.]*%[\d\.]*[bcdeufgox][\w \.]*\1/i.test( value) //增加string_format白名单
            ){
            continue;
        }else{
            //先判断是否有运算
            if(value.indexOf('+') !== -1 //+运算
                || value.indexOf('=') !== -1 //赋值
                || value.indexOf('-') !== -1
                || value.indexOf('*') !== -1
                || value.indexOf('/') !== -1){
                if(this.check_operators(value)){
                    continue;
                }
            }
            //配置的安全变量
            var safe_var = this.xssSafeVars;
            var flag = false;
            for(var j in safe_var){
                var val = new RegExp(safe_var[j]);
                if(val.test(value)) {
                    flag = true;
                    break;
                }
            }
            if (flag) continue;
        }
        // path的特殊处理
        if(type == "path") {
            //第一个变量按照html转义来校验
            if(index == 0 && (wraperContent.indexOf(matches[index]) === 1)) { 
                originType = type;
                type = "html"; 
            }
        }

        //下面开始判断某个模板变量是否进行了某种转义
        //当且仅当配置了该转义，才会进行检测和修复
        if (this.escapeMap[type] && value.indexOf(this.escapeMap[type]) === -1){
            //event为最高转义类型，用了这个转义，就不用其他方式的转义了。(除了callback)
            if (type != 'callback' && this.escapeMap['event'] && value.indexOf(this.escapeMap['event']) !== -1){
                continue;
            }
            //data转义包含js，所以如果使用了data进行了转义，则不应该报错了。
            if (type === 'js' || type === 'html'){
                if (this.escapeMap['data'] && value.indexOf(this.escapeMap['data']) !== -1){
                    continue;
                }
            }
            var str = '|' + this.escapeMap[type];

            //处理转义冲突
            var conflictMap = this.modifier_conflict_map;
            var hasConflict = false;
            if(_.array_key_exists(type, conflictMap)) {
                var conflictList = conflictMap[type];
                for(var key in conflictList) {
                    var conflict = conflictList[key];
                    if(this.escapeMap[conflict] && value.indexOf(this.escapeMap[conflict])) {
                        //XSS自动修复
                        var delStr = '|' + this.escapeMap[conflict];
                        //XSS自动修复
                        this._replaceTplVarInSentence("$" + value, str, delStr);
                        hasConflict = true;
                    }
                }
            } 
            if(!hasConflict) {
                //XSS自动修复
                this._replaceTplVarInSentence("$" + value, str, '');
            }
            //如果当前转义类型应该为data，而变量进行了js转义，则需要去掉原来的js转义，然后再进行data转义
            /*if(type == 'data' && this.escapeMap['js'] && strpos(value, this.escapeMap['js'])) {
                //XSS自动修复
                delStr = '|' . this.escapeMap['js'];
                //XSS自动修复
                this._replaceTplVarInSentence("$" . value,str,delStr);
            }else{
                //XSS自动修复
                this._replaceTplVarInSentence("$" . value,str);
            }*/

            //记录检测到的xss信息
            this._xss_result['error'].push(value + ' must be use "' + type + '" escape.');
        }else{
             //检测转义冲突
            conflictMap = this.modifier_conflict_map;
            for(var srcKey in conflictMap) {
                conflictList = conflictMap[srcKey];
                if(this.escapeMap[srcKey] && value.indexOf(this.escapeMap[srcKey]) !== -1) {
                    for(var conflictListkey in conflictList) {
                        var conflictKey = conflictList[conflictListkey];
                        if(this.escapeMap[conflictKey] && value.indexOf(this.escapeMap[conflictKey]) !== -1) {
                            str = '|' + this.escapeMap[conflictKey];
                            //XSS自动修复
                            this._replaceTplVarInSentence("$" + value,'',str);
                            this._xss_result['error'].push("[\\033[31m " + value + " \\033[0m] can not be use \"" + 
                                        this.escapeMap[conflictKey] + "\" and \"" + 
                                        this.escapeMap[srcKey] + "\" to escape at the same time.");
                        }
                    }
                }
            }
        }
    }
    //替换当前语句
    this._replaceSentenceInContent();
};

/**
 * 记录当前正在解析的语句
 * @param content
 * @private
 */
XSS.prototype._markCurParseSentence =  function(content){
    if(this.isXssAutoFixed){
        //保存当前解析的内容
        this.xss_auto_fixed['cur_parse_raw_sentence'] = content;
        //在当前解析到的内容中进行XSS修复
        this.xss_auto_fixed['cur_parse_sentence'] = content;
    }
};

XSS.prototype.repairPregReplace = function(content){
    if (typeof(content) != 'string') return content;
    content = _.str_replace('\\"', '"', content);
    return content;
};

/**
 * 记录当前正在解析的内容
 * @param content
 * @private
 */
XSS.prototype._markCurParseContent = function(content){
    if(this.isXssAutoFixed){
        //记录某段内容在文件中出现的次数
        this._markContentInFile(content);
        //保存当前解析的内容
        this.xss_auto_fixed['cur_parse_raw_content'] = content;
        //在当前解析到的内容中进行XSS修复
        this.xss_auto_fixed['cur_parse_content'] = content;
        
    }
};

/**
 * 记录某段内容在文件中出现的次数
 * @param content
 * @private
 */
XSS.prototype._markContentInFile = function(content){
    //在这里统计某段内容截止到解析时刻出现的次数
    if(this.isXssAutoFixed){
        //记录内容相同的块儿，避免在内容替换时弄错
        var not_in_arr = true;
        for(var cif_key in this.xss_auto_fixed['content_in_file']) {
            var cif_value = this.xss_auto_fixed['content_in_file'][cif_key];
            if(cif_value['content'] === content) {
//                cif_value['count']++;
                not_in_arr = false;
                break;
            }
        }
        if(not_in_arr) {
            this.xss_auto_fixed['content_in_file'].push({
                'content'	: content,
                'count'	: 1
            })
        }
    }
};

/**
 * 记录某条语句在代码中出现的次数
 * @param content
 * @private
 */
XSS.prototype._markSentenceInContent = function(content){
    if(this.isXssAutoFixed){
        //记录当前语句
        this._markCurParseSentence(content);

        //记录语句相同的代码行，避免在内容替换时弄错
        var not_in_arr = true;
        for(var sic_key in this.xss_auto_fixed['sentence_in_content']) {
            var sic_value = this.xss_auto_fixed['sentence_in_content'][sic_key];
            if(sic_value['content'] === content) {
//                sic_value['count']++;
                not_in_arr = false;
                break;
            }
        }
        if(not_in_arr) {
            this.xss_auto_fixed['sentence_in_content'].push({
                'content'   : content,
                'count'		: 1
            });
        }
    }
}

/**
 * 在语句中进行模板变量替换（XSS修复）
 * @param tpl_name
 * @param add_str_suffix
 * @param del_str_suffix
 * @private
 */
XSS.prototype._replaceTplVarInSentence = function(tpl_name, add_str_suffix, del_str_suffix){
    if(this.isXssAutoFixed) {					
        //内容替换，进行XSS自动修复
        this.xss_auto_fixed['tpl_replace_str_add'] = add_str_suffix;
        this.xss_auto_fixed['tpl_replace_str_del'] = del_str_suffix;
        
        //增加转义
        var add = 0;
        if(add_str_suffix !== '' && del_str_suffix !== '') {
            // 先去掉转义，再增加转义
            add = 2;
        }else if(del_str_suffix !== '') {
            // 去掉转义
            add = 1;
        }
        this.xss_auto_fixed['duplicated_escape'] = add;
      
        //模板变量XSS修复
        var reg = _.str_replace(
            ['LEFT', 'RIGHT'],
            [_.preg_quote(this.leftDelimiter, '/'), _.preg_quote(this.rightDelimiter, '/')], 
            "LEFT(" + _. preg_quote(tpl_name,"/") + ")\\s*RIGHT"
        );
        var self = this;
        this.xss_auto_fixed['cur_parse_sentence'] = this.xss_auto_fixed['cur_parse_sentence'].replace(
            new RegExp(reg) , function(m, m1){
                var resultString = m;
                //XSS数量加1
                self.xss_auto_fixed['xss_num']++;
                self.xss_auto_fixed['has_xss_in_cur_content'] = true;
                
                switch (self.xss_auto_fixed['duplicated_escape']) {
                    //增加转义
                    case 0:
                        resultString = m.replace(new RegExp(_.preg_quote(m1,"/")), 
                            m1 + self.xss_auto_fixed['tpl_replace_str_add']);
                        break;
        
                    //去掉转义
                    case 1:
                        resultString = m.replace(new RegExp(_.preg_quote(self.xss_auto_fixed['tpl_replace_str_del'],"/")),                             "");
                        break;
                    
                    //先去掉一个转义，再增加另外一个转义
                    case 2:
                        resultString = m.replace(new RegExp(_.preg_quote(self.xss_auto_fixed['tpl_replace_str_del'],"/")),                              "");
                        var theTplVar =  m1.replace(new RegExp(_.preg_quote(self.xss_auto_fixed['tpl_replace_str_del'],
                            "/")), "");
                        var reg = _.str_replace(
                            ['LEFT', 'RIGHT'],
                            [_.preg_quote(self.leftDelimiter, '/'), _.preg_quote(self.rightDelimiter, '/')], 
                            "LEFT(" + _.preg_quote(theTplVar,"/") + ")\\s*RIGHT"
                        );
                        
                        resultString = resultString.replace(new RegExp(reg), function(m, m1){
                            return m.replace(new RegExp(_.preg_quote(m1,"/")),m1 + self.xss_auto_fixed['tpl_replace_str_add']);
                        });
                        break;
                }
                return resultString;
            }
        );
    }
};

/**
 * 将当前解析的语句替换到内容块中
 */
XSS.prototype._replaceSentenceInContent = function(){
    if(this.xss_auto_fixed['has_xss_in_cur_content']) {
        this.xss_auto_fixed['stt_replace_time'] = 0;
        var self = this;
        this.xss_auto_fixed['cur_parse_content'] = this.xss_auto_fixed['cur_parse_content'].replace(
            new RegExp(_.preg_quote(this.xss_auto_fixed['cur_parse_raw_sentence'],'/')),function(m){
                self.xss_auto_fixed['stt_replace_time']++;
                //记录内容相同的块儿，避免在内容替换时弄错
                var not_in_arr = true;
                for(var i = 0; i < self.xss_auto_fixed['sentence_in_content'].length; i++) {
                    var sic_value = self.xss_auto_fixed['sentence_in_content'][i];
                    if(sic_value['content'] === m
                        && sic_value['count'] === self.xss_auto_fixed['stt_replace_time']) {
                        not_in_arr = false;
                        break;
                    }
                }
                if(!not_in_arr) {
                    return self.xss_auto_fixed['cur_parse_sentence'];
                }
                
                return m;
            }
        );
            
        //重置原内容，为了解决解析标签属性的情况，可能一个标签含有多个属性，而且都需要进行xss修复
        this.xss_auto_fixed['cur_parse_raw_sentence'] = this.xss_auto_fixed['cur_parse_sentence'];
        //记录当前正在处理的内容
        this._markCurParseSentence(this.xss_auto_fixed['cur_parse_raw_sentence']);
            
        //文件内容保存
        this._replaceContentInFile();
        
        this.xss_auto_fixed['has_xss_in_cur_content'] = false;
    }
};

/**
 * 将当前解析到的内容替换到源文件中
 */
XSS.prototype._replaceContentInFile = function(){
    if(this.xss_auto_fixed['has_xss_in_cur_content']) {
        this.xss_auto_fixed['ctt_replace_time'] = 0;
        var self = this;
        this.xss_auto_fixed['cur_file_content'] = this.xss_auto_fixed['cur_file_content'].replace(
            new RegExp(_.preg_quote(this.xss_auto_fixed['cur_parse_raw_content'],'/')),function(m){
                self.xss_auto_fixed['ctt_replace_time']++;
	
                //记录内容相同的块儿，避免在内容替换时弄错
                var not_in_arr = true;
                for(var i = 0; i < self.xss_auto_fixed['content_in_file'].length; i++) {
                    var cif_value = self.xss_auto_fixed['content_in_file'][i];
                    if(cif_value['content'] === m && cif_value['count'] === self.xss_auto_fixed['ctt_replace_time']) {
                        not_in_arr = false;
                        break;
                    }
                }
                
                if(!not_in_arr) {
                    return self.xss_auto_fixed['cur_parse_content'];
                }
                return m;
            }
        );
        //重置原内容，为了解决解析标签属性的情况，可能一个标签含有多个属性，而且都需要进行xss修复
        this.xss_auto_fixed['cur_parse_raw_content'] = this.xss_auto_fixed['cur_parse_content'];
        
        //记录当前正在处理的内容
        this._markCurParseContent(this.xss_auto_fixed['cur_parse_raw_content']);
    }
};

/**
 * 从内容中去掉no_escape的转义
 * @param content
 * @return {*}
 */
XSS.prototype.delNoEscape = function(content) {
    if(this.escapeMap['no_escape']) {
        var reg = _.str_replace(
            ['LEFT', 'RIGHT'],
            [_.preg_quote(this.leftDelimiter, '/'), _.preg_quote(this.rightDelimiter, '/')], 
            'LEFT\\s*\\$(.*?)\\s*RIGHT'
        );
        var self = this;
        content = content.replace(new RegExp(reg), function(m){
            var pattern = '\\|' + self.escapeMap['no_escape'];
            return m.replace(new RegExp(pattern), '');
        });
    }
    return content;
};
XSS.prototype.check_operators = function(value){
    var pos = 0,
        flag = false;
    for(var i = 0; i < this._white_operators.length; i++){
        var operator = this._white_operators[i];
        pos = value.indexOf(operator);
        if(pos !== -1){
            var operator_left_string = value.substring(0,pos+1);
            //判断是否不在字符串
            if(_.substr_count(operator_left_string, "'") % 2 === 0
                && _.substr_count(operator_left_string, '"') % 2 === 0) {
                flag = true;
                break;
            }
        }else{
            continue;
        }
    }
    return flag;
}

