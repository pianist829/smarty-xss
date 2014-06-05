/**
 * 
 * javascript词法分析类
 * 对原内容进行分析，不做任何trim处理
 *
 */
'use strict';

module.exports = {
  parse: function(content, leftDelimiter, rightDelimiter){
      var js = new AnalyticJs();
      return js.parse(content, leftDelimiter, rightDelimiter);
  }  
};
var _ = require('./util.js');

function AnalyticJs(){
    this.parsePos = 0;
	
	this.content = '';
	
	this.contentLength = 0;
	
	this._output = [];
	
    /**
     * 空白字符
     * @var type 
     */
    this.whitespace = new Array(
        '\n','\r',' ','\t'
    );
	
    /**
     * 字母表
     * @var type 
     */
    this.wordstr = new Array(
        'a','b','c','d','e','f','g','h','i','j','k','l','m',
        'n','o','p','q','r','s','t','u','v','w','x','y','z',
        'A','B','C','D','E','F','G','H','I','J','K','L','M',
        'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
        '0','1','2','3','4','5','6','7','8','9','_','','.'
    );
	
    /**
     * 数字
     * @var type 
     */
    this.digits = new Array(
        '0','1','2','3','4','5','6','7','8','9'
    );
	
    /**
     * 操作符
     * @var type 
     */
    this.punct = new Array(
        '+','-','*','/','%','&','++','--','=','+=','-=',
        '*=','/=','%=','==','===','!=','!==','>','<','>=',
        '<=','>>','<<','>>>', '>>>=','>>=','<<=','&&','&=',
        '|','||','!','!!',',',':','?','^','^=','|=','::'
    );
	
    /**
     * 关键字
     * @var type 
     */
    this.keyword = new Array(
        "break",    "case",         "catch",    "const",    "continue",
        "default",  "delete",       "do",       "else",     "finally",
        "for",      "function",     "if",       "in",       "instanceof",
        "new",      "return",       "switch",   "throw",    "try",
        "typeof",   "var",          "void",     "while",    "with"
    );
	
    /**
     * 保留字
     * @var type 
     */
    this.reservedWord = new Array(
        "abstract",     "boolean",      "byte",     "str",         "class",
        "debugger",     "double",       "enum",     "export",       "extends",
        "final",        "float",        "goto",     "implements",   "import",
        "int",          "interface",    "long",     "native",       "package",
        "private",      "protected",    "public",   "short",        "static",
        "super",        "synchronized", "throws",   "transient",    "volatile"
    );
    
    this.leftDelimiter = '<&';
	this.rightDelimiter = '&>';
}

AnalyticJs.prototype.parse = function(content, leftDelimiter, rightDelimiter){
    this.content = content;
    this.contentLength = content.length;
    this.leftDelimiter = leftDelimiter;
    this.rightDelimiter = rightDelimiter;
    this._output = [];
    this.tokenAnalytic();
    return this._output;
};

AnalyticJs.prototype.tokenAnalytic = function(){
    while (true){
        var token = this.getNextToken();
        if (token){
            if (token[1] === _.sign.FL_EOF) break;
            this._output.push(token);
        }
    }
};

AnalyticJs.prototype.getNextToken = function(){
    if (this.parsePos >= this.contentLength){
        return new Array('', _.sign.FL_EOF);
    }
    var str = this.content[this.parsePos];
    this.parsePos++;
    
    //while (in_new Array(str, this._whitespace)){
    //在数量比较小的情况下（小于5），直接判断比in_array要快一倍
    if (str === " " || str === "\n" || str === "\t" || str === "\r"){
        if (this.parsePos >= this.contentLength){
            return new Array(str, _.sign.FL_EOF);
        }else if (str === "\x0d") {
            return '';	
        }else if (str === "\x0a"){
            return new Array(str, _.sign.FL_NEW_LINE);
        }
    }
    
    //处理模板左右定界符
    var result = _.getTplDelimiterToken.call(this);
    if (result) return result;
    //处理正常的字符
    if (_.in_array(str, this.wordstr)){
        result = this._getWordToken(str);
        if (result) return result;
    }
    switch (true){
        case str === '(' || str === '[' : return [str, _.sign.JS_START_EXPR];
        case str === ')' || str === ']' : return [str, _.sign.JS_END_EXPR];
        case str === '{' : return [str, _.sign.JS_START_BLOCK];
        case str === '}' : return [str, _.sign.JS_END_BLOCK];
        case str === ';' : return [str, _.sign.JS_SEMICOLON];
    }
    //评论或者正则
    if (str === '/'){
        //注释
        result = this._getCommentToken(str);
        if (result) return result;
        
        //正则
        var tokenCount = this._output.length,
            lastText,
            lastType;
        if (tokenCount){
            lastText = this._output[tokenCount - 1][0];
            lastType = this._output[tokenCount - 1][1];
        }else {
            lastType = _.sign.JS_START_EXPR;
        }
        if ((lastType === _.sign.JS_WORD && (lastText === 'return' || lastText === 'to'))
            || (lastType === _.sign.JS_START_EXPR
                || lastType === _.sign.JS_START_BLOCK
                || lastType === _.sign.JS_END_BLOCK
                || lastType === _.sign.JS_OPERATOR
                || lastType === _.sign.JS_EQUALS 
                || lastType === _.sign.JS_SEMICOLON
                || lastType === _.sign.FL_EOF
                )){
                    
            result = this._getRegexpToken(str);
            if (result) return result;
        }
    }
    //引号
    if (str === '"' || str === "'"){
        result = this._getQuoteToken(str);
        if (result) return result;	
    }
    //sharp variables
    if (str === '#'){
        result = this._getSharpVariblesToken(str);
        if (result) return result;
    }
    //操作符
    if (_.in_array(str, this.punct)){
        result = this._getPunctToken(str);
        if (result) return result;
    }
    
    return [str, _.sign.FL_NORMAL];
};

AnalyticJs.prototype._getWordToken = function(str){
    while (_.in_array(this.content[this.parsePos], this.wordstr) 
        && this.parsePos < this.contentLength){
        str += this.content[this.parsePos];
        this.parsePos++;
    }
    //处理带E的数字，如：20010E+10,0.10E-10
    if ((this.content[this.parsePos] === '+' || this.content[this.parsePos] === '-')
        && str.match(/^[0-9]+[Ee]/)
        && this.parsePos < this.contentLength){
            
        var sign = this.content[this.parsePos];
        this.parsePos++;
        var t = this.getNextToken();
        str += sign . t[0];
        return new Array(str, _.sign.JS_WORD);
    }
    //for in operator
    if (str === 'in'){
        return new Array(str , _.sign.JS_OPERATOR);
    }
    return new Array(str, _.sign.JS_WORD);
};

AnalyticJs.prototype._getCommentToken = function(str){
    var comment = '';
    var lineComment = true;
    var c = this.content[this.parsePos];
    //单行或者多行注释
    if(c === '*'){
        this.parsePos++;
        while (!(this.content[this.parsePos] === '*' 
                && this.content[this.parsePos + 1] 
                && this.content[this.parsePos + 1] === '/') 
                && this.parsePos < this.contentLength){
                    
            var cc = this.content[this.parsePos];
            comment += cc;
            //\x0d为\r, \x0a为\n
            if (cc === "\x0d" || cc === "\x0a"){
                lineComment = false;
            }
            this.parsePos++;
        }
        
        this.parsePos += 2;
        //ie下的条件编译
        if (comment.indexOf('@cc_on') === 0){
            return new Array('/*' + comment + '*/', _.sign.JS_IE_CC);
        }
        if (lineComment){
            return new Array('/*' + comment + '*/', _.sign.JS_INLINE_COMMENT);
        }else{
            return new Array('/*' + comment + '*/', _.sign.JS_BLOCK_COMMENT);
        }
    }
    //单行注释
    if (c === '/'){
        comment = str;
        //\x0d为\r, \x0a为\n
        while (this.content[this.parsePos] !== "\x0d" 
                && this.content[this.parsePos] !== "\x0a"
                && this.parsePos < this.contentLength){
            
            comment += this.content[this.parsePos];
            this.parsePos++;
        }
        return new Array(comment, _.sign.JS_COMMENT);
    }
};
	//引号
AnalyticJs.prototype._getQuoteToken = function(str){
    var sep = str;
    var escape = false;
    var resultString = str;
    while (this.content[this.parsePos] !== sep || escape){
        //引号里含有smarty语法，smarty语法里含有引号
        var result = _.getTplDelimiterToken.call(this);
        if(result){
            resultString += result[0].substr(1);
        }else{
            resultString += this.content[this.parsePos];
            escape = !escape ? (this.content[this.parsePos] === "\\") : false;
            this.parsePos++;
        }
        if (this.parsePos >= this.contentLength){
            return new Array(resultString, _.sign.JS_STRING);
        }
    }
    this.parsePos++;
    resultString += sep;
    return new Array(resultString, _.sign.JS_STRING);
};
	//正则
AnalyticJs.prototype._getRegexpToken = function(str){
    var sep = str;
    var escape = false;
    var resultString = str;
    var instrClass = false;
    while (escape || instrClass || this.content[this.parsePos] !== sep){
        resultString += this.content[this.parsePos];
        if (!escape){
            escape = (this.content[this.parsePos] === "\\");
            if (this.content[this.parsePos] === '['){
                instrClass = true;
            }else if(this.content[this.parsePos] === ']'){
                instrClass = false;
            }
        }else {
            escape = false;
        }
        this.parsePos++;
        if (this.parsePos >= this.contentLength){
            return new Array(resultString, _.sign.JS_REGEXP);
        }
    }
    this.parsePos++;
    resultString += sep;
    while (_.in_array(this.content[this.parsePos], this.wordstr) 
        && this.parsePos < this.contentLength ) {
        resultString += this.content[this.parsePos];
        this.parsePos++;
    }
    return new Array(resultString, _.sign.JS_REGEXP);
};
	//sharp varibles
AnalyticJs.prototype._getSharpVariblesToken = function(str){
    var sharp = str;
    if (_.in_array(this.content[this.parsePos], this.digits)){
        do{
            var c = this.content[this.parsePos];
            sharp += c;
            this.parsePos++;
        }while (c !== '#' && c !== '=' && this.parsePos < this.contentLength);
        var next = this.content.substring(this.parsePos, 2);
        if (next === '[]' || next === '{}'){
            sharp += next;
            this.parsePos += 2;
        }
        return new Array(sharp, _.sign.JS_WORD);
    }
    return [];
};
	//操作符
AnalyticJs.prototype._getPunctToken = function(str){
    while(_.in_array(str + this.content[this.parsePos], this.punct) 
        && this.parsePos < this.contentLength){
        str += this.content[this.parsePos];
        this.parsePos++;
    }
    return new Array(str, str === '=' ? _.sign.JS_EQUALS : _.sign.JS_OPERATOR);
};