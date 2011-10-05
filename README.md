Setup Instructions:

Client Side Setup:

<script src="http://code.jquery.com/jquery-1.4.4.js"></script>
<script src="jQuery.peerbind.js"></script>

... Yea it was that easy ..

Setting up an endpoint:

Install node.js (nodejs.org)
	Mac brew:
		brew install node

Run	
cd ~/peerbind
node peerbindserver.js

Note: this server will serve files relative from the calling directory.
You can specify the public directory with the first argument after the server.

node peerbindserver.js /var/www/peerbind/
node peerbindserver.js ~/peerbind


The index.html file included has some example code to set up a simple chat app to run over your localhost.