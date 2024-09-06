# Client ESI Parser

###Original Code: https://github.com/MrSwitch/esi.

This project performs what the Edge Side Includes engine on the CDN provider such as Akamai in the client side (browser) instead. That is, it looks for ESI tags in the `body` of the HTML and replaces them with appropriate content specified by the tags.  

To enable this, you need to add the following code in the HTML page that ESI tags are present.

```
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
<script src="esi.js"></script>
```

That's it!