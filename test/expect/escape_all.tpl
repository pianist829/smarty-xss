<html>
<head>
    <script>
        var x = "{#$spNum|f_escape_js#}";
    </script>
</head>
<body>
    <div class="{#$spUserInfo.userName|f_escape_xml#}">
        {#$spUserInfo.city|f_escape_xml#}
    </div>
    <div onclick="testTitle('{#$title|f_escape_event#}')"></div>
    <a href="http://hi.baidu.com/sys/checkuser/{#$spUserInfo.name|f_escape_path#}/3"></a>
    <img src="http://hi.baidu.com/sys/checkuser/{#$spUserInfo.name|f_escape_path#}/3" alt="xssrepire"/>
    <div class='content-album-info'>
        <a class='content-album-name yahei'
        href='{#if $item.album_picture_total > 0#}/picture/album/list/{#$item.album_sign|f_escape_path#}{#else#}/picture/page/upload?album_sign={#$item.album_sign|f_escape_path#}{#/if#}'>{#$item.album_name|f_escape_xml#}</a>
        <span class='content-album-date'>
            {#$item.create_time|date_format:"%Y-%m-%d"#}
        </span>
    </div>
</body>
</html>