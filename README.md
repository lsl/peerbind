Peerbind
========

Peerbind is an event binding library that allows JavaScript-initiated interactions between website visitors.

Originally Authored by Matt Amacker [https://twitter.com/#!/peerbind](@peerbind) an Engineer for A9.com. This is an adaption to help people get up and running with their own endpoints or Peerbind in general.

* Website: [http://peerbind.com](http://peerbind.com)
* Original Client: [http://js.peerbind.com/jQuery.peerbind.js](http://js.peerbind.com/jQuery.peerbind.js)
* Original Server: [http://peerbind.com/peerbindserver.js](http://peerbind.com/peerbindserver.js)
* Code: [https://github.com/lsl/peerbind](https://github.com/lsl/peerbind)
* ASL: [Amazon Software Licence](http://aws.amazon.com/asl/)

Client side setup
-----------------

Include jquery.js and jQuery.peerbind.js into your webpage:

    <script src="http://code.jquery.com/jquery-1.7.min.js"></script>
    <script src="jQuery.peerbind.js"></script>

Bind an event to a DOM element:

    <script>
      $(document).ready(function() {
        function addChat(msg) {
          $("#chats").append("<br>"+msg);
        }
        
        $("input").peerbind("change", {
          peer:  function(e) { addChat(e.srcPeer + ": " + e.peerData);},
          local: function(e) { addChat("You: " + e.peerData); $(this).val("");}
        });
      });
    </script>
    Type a message: <input type="text"> 
    <div id="chats"></div>

That's it! Have a look at the [documentation](http://peerbind.com/#configuration) for other parts of the API.

Running your own Peerbind server (endpoint)
--------------------------------

You'll need to have [node.js](http://nodejs.org/) installed to run the Peerbind server. For installation instructions see [the node.js wiki](https://github.com/joyent/node/wiki/Installation). Once you've installed node, you can run the Peerbind server with the following command:

    node peerbindserver.js

This server will serve files relative from the calling directory. You can specify the public directory with the first argument after the server:

    node peerbindserver.js /var/www/peerbind/
    node peerbindserver.js ~/peerbind

The index.html file included in this repository has some example code to set up a simple chat app that can run over a localhost node.js server and your browser.
