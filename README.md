# ditherproxy
Proxy server docker image, for dithering images, for epaper displays, using the epdoptimize library.

This uses the epdoptimize library: https://github.com/paperlesspaper/epdoptimize

The docker image is here: https://hub.docker.com/r/mhwlng/ditherproxy/tags

You need two urls:

1) A URL of the original image.
2. A URL pointing to a json file, containing the dithering configuration parameters.<br>
 That json file can be created on the epdoptimize site: https://paperlesspaper.github.io/epdoptimize/

Example image and json file for a BWR e-paper display:

https://mhwlng.github.io/ditherproxy/test/chart1.jpg

https://mhwlng.github.io/ditherproxy/test/chart1-config.json

Example image and json file for a spectra e-paper display:

https://mhwlng.github.io/ditherproxy/test/cat1.jpg

https://mhwlng.github.io/ditherproxy/test/cat1-config.json

These files can be found in the 'test' folder.

You can create a ditherproxy docker container, as defined in docker-compose.yml:

~~~
docker-compose -f docker-compose.yml up -d
~~~

Using a local docker container:

You need to urlencode the urls to the image and to the json file:

http://127.0.0.1:3000/?url=https%3A%2F%2Fmhwlng%2Egithub%2Eio%2Fditherproxy%2Ftest%2Fchart1%2Ejpg&jsonurl=https%3A%2F%2Fmhwlng%2Egithub%2Eio%2Fditherproxy%2Ftest%2Fchart1-config%2Ejson

http://127.0.0.1:3000/?url=https%3A%2F%2Fmhwlng%2Egithub%2Eio%2Fditherproxy%2Ftest%2Fcat1%2Ejpg&jsonurl=https%3A%2F%2Fmhwlng%2Egithub%2Eio%2Fditherproxy%2Ftest%2Fcat1-config%2Ejson

The resulting dithered images (always png) look like:

https://mhwlng.github.io/ditherproxy/test/chart1-result.png

https://mhwlng.github.io/ditherproxy/test/cat1-result.png

Here is a photograph of 3 different epaper displays, with the above test images:

https://mhwlng.github.io/ditherproxy/test/epaper-results.jpg


There is also a health check url:

http://127.0.0.1:3000/health
 
 
You can use nginx as a proxy for this docker container:
 
compose.yaml would look something like this:

~~~
services:
    ditherproxy:
        image: mhwlng/ditherproxy:latest
        container_name: ditherproxy
        restart: unless-stopped
    nginx:
        container_name: nginx
        restart: unless-stopped
        environment:
          -  TZ=Europe/Amsterdam
        volumes:
            - /app/nginxweb/wwwroot:/usr/share/nginx/html
            - /app/nginxweb/conf:/etc/nginx/conf.d
            - /app/nginxweb/logs:/var/log/nginx
            - /app/cert:/etc/ssl/private:r
        ports:
            - 8083:80
            - 8084:443         
        image: nginx:latest
~~~

You do not define any port bindings in the ditherproxy service, so that the ditherproxy web server is not reachable outside nginx

you can add something like this to your nginx .conf file:

~~~
   location /ditherproxy/ {
         proxy_pass http://ditherproxy:3000;
         proxy_read_timeout 90;

         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
         proxy_set_header X-Original-Args $args;
         proxy_hide_header Upgrade;                
    }
~~~
