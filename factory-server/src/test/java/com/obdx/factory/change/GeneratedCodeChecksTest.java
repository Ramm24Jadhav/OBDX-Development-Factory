package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** JavaScript that does not parse fails; files of a change that do not fit each other are named. */
class GeneratedCodeChecksTest {

    @Test
    void javaScriptWithABrokenStructureFails() {
        assertThat(JavaScriptCheck.structure("define([], function () {\n  return { a: [1, 2 };\n});")).contains("line 2", "does not match");
        assertThat(JavaScriptCheck.structure("const s = 'not closed;\nconst t = 1;")).contains("string starting on line 1");
        assertThat(JavaScriptCheck.structure("/* open comment")).contains("comment");
        // regular expressions, template literals and division are not brackets
        assertThat(JavaScriptCheck.structure("const r = /[(]/g; const t = `a ${b} (`; const d = a / b / (c);")).isNull();
        assertThat(JavaScriptCheck.structure("if (x) { return /\\)/.test(y); }")).isNull();
        assertThat(FileChecks.check("vm.js", "define([], function () {\n  return 1;\n").status()).isEqualTo(FileChecks.Status.FAILED);
    }

    @Test
    void anAmdModuleNeedsAModuleForEachParameter() {
        FileChecks.Result tooMany = JavaScriptCheck.check("""
                define(['knockout'], function (ko, ArrayDataProvider) {
                  return function () {};
                });
                """);
        assertThat(tooMany.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(tooMany.message()).contains("1 module(s)", "2 parameter(s)", "ArrayDataProvider");

        // side-effect modules after the parameters are normal in JET
        assertThat(JavaScriptCheck.check("""
                define(['knockout', 'ojs/ojarraydataprovider', 'ojs/ojtable'], function (ko, ArrayDataProvider) {
                  'use strict';
                  return function ViewModel(params) {
                    const self = this;
                    const { rootModel } = params;
                    self.rows = ko.observableArray([]);
                    self.provider = new ArrayDataProvider(self.rows, { keyAttributes: 'id' });
                    self.load = function (event) { return rootModel.service.read().then((data) => self.rows(data.items)); };
                    window.console.log(JSON.stringify(Math.max(1, 2)));
                  };
                });
                """).status()).isEqualTo(FileChecks.Status.PASSED);

        FileChecks.Result unknown = JavaScriptCheck.check("""
                define(['knockout'], function (ko) {
                  return function () { this.provider = new ArrayDataProvider([]); this.x = Model.read(); };
                });
                """);
        assertThat(unknown.status()).isEqualTo(FileChecks.Status.WARNING);
        assertThat(unknown.message()).contains("Model").doesNotContain("ko,");
    }

    @Test
    void reactCodeInAJsFileGetsOnlyTheBasicCheck() {
        assertThat(FileChecks.check("Screen.js", "import React from 'react';\nexport default () => (<Text>Don't worry</Text>);\n").status())
                .as("at most a warning of the basic check").isNotEqualTo(FileChecks.Status.FAILED);
    }

    @Test
    void lowercaseJsxIsReactToo() {
        String footer = "export default function Footer() {\n  return <footer className=\"x\">Don't miss it</footer>;\n}\n";
        assertThat(FileChecks.looksLikeJsx(footer)).isTrue();
        assertThat(FileChecks.check("Footer.js", footer).status()).isNotEqualTo(FileChecks.Status.FAILED);
        assertThat(FileChecks.looksLikeJsx("const List = () => <ul>{items}</ul>;")).isTrue();
        assertThat(FileChecks.looksLikeJsx("define(['knockout'], function (ko) { return a < b; });")).isFalse();
    }

    @Test
    void recordsEnumsObjectMethodsAndLombokAreNotMissingMethods() {
        String resource = """
                package com.bank.si;
                public class SiResource {
                    public Object read(SiView view, SiStatus status, SiData data, SiService service) {
                        String a = view.amount() + view.toString() + view.hashCode();
                        String b = status.name() + status.ordinal() + status.getClass();
                        String c = data.getAmount();
                        return service.equals(view) ? a + b + c : service.list();
                    }
                }
                """;
        Map<String, String> classes = Map.of(
                "SiView", "package com.bank.si;\npublic record SiView(String amount, String currency) { }",
                "SiStatus", "package com.bank.si;\npublic enum SiStatus { ACTIVE, CANCELLED }",
                "SiData", "package com.bank.si;\nimport lombok.Data;\n@Data\npublic class SiData { private String amount; }",
                "SiService", "package com.bank.si;\npublic class SiService { public java.util.List<String> list() { return null; } }");

        assertThat(CrossFileJava.missingMethods(resource, classes)).isEmpty();
        // a record has no accessor it does not declare
        assertThat(CrossFileJava.missingMethods("package com.bank.si;\nclass R { Object a(SiView v) { return v.rate(); } }", classes))
                .singleElement().asString().contains("rate()");
    }

    @Test
    void namesClassesOfThePlanThatAreNotWritten() {
        String resource = "package com.bank.si;\nclass SiResource { SiDTO dto; SiService service; }";

        assertThat(CrossFileJava.unwrittenClasses("src/com/bank/si/SiResource.java", resource,
                List.of("src/com/bank/si/SiDTO.java", "src/com/bank/other/SiService.java", "ui/si.js")))
                .hasValueSatisfying(p -> assertThat(p).startsWith(CrossFileJava.UNWRITTEN + ": SiDTO.").doesNotContain("SiService"));
        assertThat(CrossFileJava.unwrittenClasses("src/com/bank/si/SiResource.java", resource, List.of())).isEmpty();
    }

    @Test
    void namesCallsToMethodsTheServiceDoesNotHave() {
        String service = """
                package com.bank.si;
                public class SiService {
                    public java.util.List<String> list(String customer) { return null; }
                    public void delete(String customer, String id) { }
                    public void audit(String... events) { }
                }
                """;
        String resource = """
                package com.bank.si;
                public class SiResource {
                    private final SiService service = new SiService();
                    public Object list(String customer) {
                        service.audit("a", "b", "c");
                        service.delete(customer);
                        return this.service.listAll(customer);
                    }
                    public Object fine(String customer) { return service.list(customer); }
                }
                """;

        List<String> problems = CrossFileJava.missingMethods(resource, Map.of("SiService", service, "SiResource", resource));

        assertThat(problems).singleElement().asString().startsWith(CrossFileJava.MISSING_METHODS + " SiService does not have: ")
                .contains("delete with 1 argument(s)", "listAll()").doesNotContain("audit").doesNotContain("list(),");
    }
}
