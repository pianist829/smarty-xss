# XSS repair or check for the smarty template.

对Smarty模板进行XSS校验修复
======

## 安装

**npm install smarty-xss**


## 原理

通过配置对应类型(js、event、path、xml、data)的转义插件名称，对Smarty模板进行XSS检验修复。

## 使用方法

### 载入模块

```javascript
var xss = require('smarty-xss');
```

### 设置配置参数

```javascript

var option = {}
    escapeMap = {
        'js' : 'f_escape_js',
        'html' : 'f_escape_xml',
        'data' : 'f_escape_data',
        'path' : 'f_escape_path',
        'event' : 'f_escape_event',
        'no_escape' : 'escape:none'
    };
//不同类型对应的转义列表，默认为空
option['escapeMap'] = escapeMap;
//Smarty模板变量左定界符，默认为:<&
option['leftDelimiter'] = '{#';
//Smarty模板变量右定界符，默认为:&>
option['rightDelimiter'] = '#}';
//XSS安全变量，不需要进行转义
option['xssSafeVars'] = ['fis_safe','fis_xss'];
//设置参数
xss.config(option);
//只进行校验，返回为记录校验信息的数组
var check-result = xss.check('<div class="{#$spUserInfo.userName#}">{#$spUserInfo.city#}</div>');
//进行校验修复,返回为修复后的内容
var result = xss.repair('<div class="{#$spUserInfo.userName#}">{#$spUserInfo.city#}</div>');
```

## 测试

### 系统测试

在源码目录执行命令：**npm test**