# ditherproxy
Proxy server for dithering images, using the epdoptimize library.

This uses the epdoptimize library: https://github.com/paperlesspaper/epdoptimize

You need two urls:

1) A URL of the original image.
2. A URL pointing to a json file, containing the dithering configuration parameters.<br>
 That json file can be created on the epdoptimize site. (See bottom left): https://paperlesspaper.github.io/epdoptimize/

Example image and json file for a BWR e-paper display:

https://mhwlng.github.io/ditherproxy/test/chart1.jpg

https://mhwlng.github.io/ditherproxy/test/chart1-config.json

These files can be found in the 'test' folder.

Create a docker container, as defined in docker-compose.yml:

docker-compose -f docker-compose.yml up -d

Local docker container:

You need to urlencode the urls to the image and to the json file:

http://127.0.0.1:3000/?url=https%3A%2F%2Fmhwlng%2Egithub%2Eio%2Fditherproxy%2Ftest%2Fchart1%2Ejpg&jsonurl=https%3A%2F%2Fmhwlng%2Egithub%2Eio%2Fditherproxy%2Ftest%2Fchart1-config%2Ejson

There is also a health check url:

 http://127.0.0.1:3000/health