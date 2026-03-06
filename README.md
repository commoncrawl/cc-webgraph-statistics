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

You may need to install `JSON::XS` via [`cpanm`](https://github.com/miyagawa/cpanminus).  You may also wish to use a Python environment in order for the Makefile's `pip install` to do its thing.

If you encounter the message:
```
Can't verify SSL peers without knowing which Certificate Authorities to trust
```
... this is likely to be fixed by doing `cpanm LWP::Protocol::https IO::Socket::SSL Mozilla::CA`.

Please feel free to [contact us](https://commoncrawl.org/contact-us) if you have any questions or need any assistance.
