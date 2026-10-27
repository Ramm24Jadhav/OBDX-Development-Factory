package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FileChecksTest {

    @Test
    void parsesJavaJsonAndXml() {
        assertThat(FileChecks.check("A.java", "package a;\nclass A { void x() {} }\n").status()).isEqualTo(FileChecks.Status.PASSED);
        FileChecks.Result broken = FileChecks.check("A.java", "class A { void x( }");
        assertThat(broken.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(broken.message()).startsWith("Java does not parse");
        assertThat(FileChecks.check("a.json", "{\"a\": [1, 2]}").status()).isEqualTo(FileChecks.Status.PASSED);
        assertThat(FileChecks.check("a.json", "{\"a\": [1, 2}").status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(FileChecks.check("web.xml", "<web-app><servlet/></web-app>").status()).isEqualTo(FileChecks.Status.PASSED);
        assertThat(FileChecks.check("web.xml", "<web-app><servlet></web-app>").status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(FileChecks.check("x.sql", "select 1").status()).isEqualTo(FileChecks.Status.NOT_CHECKED);
        assertThat(FileChecks.check("x.sql", "  ").status()).isEqualTo(FileChecks.Status.FAILED);
    }

    @Test
    void basicChecksForJavaScriptAndHtmlOnlyWarn() {
        String js = """
                define(['knockout'], function (ko) {
                  // a comment with a stray ) bracket
                  const text = "string with { brace";
                  /* block { comment */
                  return function () { this.x = ko.observable(`template ${1 + 2}`); };
                });
                """;
        assertThat(FileChecks.check("vm.js", js).status()).isEqualTo(FileChecks.Status.PASSED);
        FileChecks.Result missing = FileChecks.check("vm.js", "define([], function () {\n  return 1;\n");
        assertThat(missing.status()).isEqualTo(FileChecks.Status.WARNING);
        assertThat(missing.message()).contains("not closed");

        assertThat(FileChecks.check("v.html", "<div><oj-input-text value='{{x}}'></oj-input-text><oj-button/></div>").status())
                .isEqualTo(FileChecks.Status.PASSED);
        assertThat(FileChecks.check("v.html", "<div><oj-form-layout><oj-input-text></oj-input-text></div>").status())
                .isEqualTo(FileChecks.Status.WARNING);
    }
}
