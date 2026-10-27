OBDX Development Factory
========================

Start on Windows
  1. Unzip this folder anywhere, for example C:\obdx-factory (not in Program Files).
  2. Double-click start.bat. The first start takes a minute or two.
  3. Open http://localhost:8080/ and sign in as admin, password Factory-Admin-1
     (set in settings.properties before the first start).
  Stop it with Ctrl+C in its window, or by closing the window.

Start on Linux
  ./start.sh   (as an ordinary user, not root)

What you need
  - Java 21: included in the Windows download (jre folder). Otherwise install Java 21.
  - Subversion command line tools, to import code: on Windows, TortoiseSVN with "command line client tools"
    ticked (https://tortoisesvn.net); on Linux, the subversion package.
  - Optional, for the AI features: a model server such as Ollama (https://ollama.com), then
      ollama pull qwen2.5-coder:7b
      ollama pull nomic-embed-text
  Nothing else: the factory starts its own trial database.

Try it with demo code
  Run create-demo-svn.bat (or ./create-demo-svn.sh). It creates two small OBDX-style SVN repositories in the
  demo-svn folder and prints their URLs. In the factory, create a workspace for each and import it.

Your data
  Everything is kept in the data folder: the trial database, imported code and the key that encrypts stored SVN
  passwords (data\secret.key). To update the factory, unzip the new version and copy the data folder and
  settings.properties into it. To start over, stop the factory and delete the data folder.

Sharing with colleagues
  Set FACTORY_BIND_ADDRESS=0.0.0.0 in settings.properties; colleagues then open http://<computer name>:8080/.
  For a team installation, use a PostgreSQL server instead of the trial database (see settings.properties) and
  the installation guide in docs/DEVELOPMENT.md of the repository.
