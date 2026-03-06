# cc-webgraph-statistics

![image](docs/img/masthead.webp)

Web page showing statistics and plots derived from Common Crawl's monthly Web Graphs, and generation tools.

## Setup

```
cd src
make
```

## Updating

```
cd src
make update
```

## Modifications

Sometimes you may want to generate the HTML without generating the plots.  You can do this with:

```
cd src
make noplot
```

## Notes

Built web page can be found in `docs/index.html`.

### Dependencies

You may need to install `JSON::XS` via [`cpanm`](https://github.com/miyagawa/cpanminus). You may also wish to use a Python environment in order for the Makefile's `pip install` to do its thing.

> [!TIP]
> If you encounter the message:
> ```
> Can't verify SSL peers without knowing which Certificate Authorities to trust
> ```
> This is likely to be fixed by running:
> ```
> cpanm LWP::Protocol::https IO::Socket::SSL Mozilla::CA
> ```

> [!TIP]
> **macOS users:** You may need to install Perl dependencies via Homebrew:
> ```bash
> brew install ca-certificates cpanminus
> cpanm LWP::Protocol::https IO::Socket::SSL Mozilla::CA
> export PERL_LWP_SSL_CA_FILE="$(brew --prefix)/etc/ca-certificates/cert.pem"
> ```

### Local development

If you are running this locally, you may see "No data available" on the rank tables unless you serve the site with a local HTTP server.

> [!TIP]
> `fetch()` will fail silently when viewing the page as a `file://` URL because browsers block local file access for security reasons. To fix this:
> ```bash
> cd docs && python3 -m http.server 8000
> ```
> Then open [http://localhost:8000](http://localhost:8000).

### Contact

Please feel free to [contact us](https://commoncrawl.org/contact-us) if you have any questions or need any assistance.
