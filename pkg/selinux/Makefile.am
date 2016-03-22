PKGDIR=pkg/selinux

setroubleshoot_MODULES = \
	$(PKGDIR)/setroubleshoot.js \
	$(PKGDIR)/setroubleshoot-client.js \
	$(PKGDIR)/views/setroubleshoot-view.js \
	$(NULL)

setroubleshoot_TESTS = \
	$(NULL)

# Typically only modify stuff above this line

setroubleshootdir = $(pkgdatadir)/selinux
nodist_setroubleshoot_DATA = \
	$(PKGDIR)/setroubleshoot.min.html.gz \
	$(PKGDIR)/bundle.min.js.gz \
	$(PKGDIR)/setroubleshoot.min.css.gz \
	$(NULL)
setroubleshoot_DATA = \
	$(PKGDIR)/manifest.json \
	$(NULL)

setroubleshootdebugdir = $(debugdir)$(setroubleshootdir)
setroubleshootdebug_DATA = \
	$(PKGDIR)/bundle.js \
	$(PKGDIR)/setroubleshoot.css \
	$(PKGDIR)/setroubleshoot.html \
	$(PKGDIR)/setroubleshoot.js \
	$(PKGDIR)/setroubleshoot-client.js \
	$(PKGDIR)/views/setroubleshoot-view.js \
	$(NULL)

install-data-hook::
	mkdir -p $(DESTDIR)$(setroubleshootdebugdir)
	tar -chf - -C $(srcdir) $(setroubleshoot_MODULES) | tar -xf - --strip-components=2 -C $(DESTDIR)$(setroubleshootdebugdir)

uninstall-hook::
	rm -rf $(DESTDIR)$(setroubleshootdebugdir)/views

setroubleshoot_MIN = $(setroubleshoot_MODULES:.js=.min.js)

setroubleshoot_BUNDLE = \
	$(setroubleshoot_MIN) \
	$(NULL)

# Everything else into a nice big bundle
$(PKGDIR)/bundle.min.js: $(setroubleshoot_BUNDLE)
	$(AM_V_GEN) $(srcdir)/tools/missing $(srcdir)/tools/jsbundle $@ $^

TESTS += $(setroubleshoot_TESTS)

CLEANFILES += \
	$(PKGDIR)/setroubleshoot.min.css \
	$(PKGDIR)/setroubleshoot.min.html \
	$(PKGDIR)/bundle.min.js \
	$(setroubleshoot_MIN) \
	$(nodist_setroubleshoot_DATA) \
	$(NULL)

EXTRA_DIST += \
	$(PKGDIR)/setroubleshoot.min.css \
	$(PKGDIR)/setroubleshoot.min.html \
	$(PKGDIR)/bundle.min.js \
	$(setroubleshoot_BOWER) \
	$(setroubleshoot_BUNDLE) \
	$(setroubleshoot_MODULES) \
	$(setroubleshoot_DATA) \
	$(setroubleshootdebug_DATA) \
	$(setroubleshoot_TESTS) \
	$(NULL)