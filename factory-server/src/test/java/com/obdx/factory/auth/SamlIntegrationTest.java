package com.obdx.factory.auth;

import net.shibboleth.shared.xml.SerializeSupport;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.opensaml.core.xml.XMLObjectBuilderFactory;
import org.opensaml.core.xml.config.XMLObjectProviderRegistrySupport;
import org.opensaml.core.xml.schema.XSString;
import org.opensaml.core.xml.util.XMLObjectSupport;
import org.opensaml.saml.saml2.core.Assertion;
import org.opensaml.saml.saml2.core.Attribute;
import org.opensaml.saml.saml2.core.AttributeStatement;
import org.opensaml.saml.saml2.core.AttributeValue;
import org.opensaml.saml.saml2.core.Audience;
import org.opensaml.saml.saml2.core.AudienceRestriction;
import org.opensaml.saml.saml2.core.AuthnContext;
import org.opensaml.saml.saml2.core.AuthnContextClassRef;
import org.opensaml.saml.saml2.core.AuthnStatement;
import org.opensaml.saml.saml2.core.Conditions;
import org.opensaml.saml.saml2.core.Issuer;
import org.opensaml.saml.saml2.core.NameID;
import org.opensaml.saml.saml2.core.Response;
import org.opensaml.saml.saml2.core.Status;
import org.opensaml.saml.saml2.core.StatusCode;
import org.opensaml.saml.saml2.core.Subject;
import org.opensaml.saml.saml2.core.SubjectConfirmation;
import org.opensaml.saml.saml2.core.SubjectConfirmationData;
import org.opensaml.security.credential.CredentialSupport;
import org.opensaml.xmlsec.SignatureSigningParameters;
import org.opensaml.xmlsec.signature.support.SignatureConstants;
import org.opensaml.xmlsec.signature.support.SignatureSupport;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.saml2.core.OpenSamlInitializationService;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

import javax.xml.namespace.QName;
import java.io.ByteArrayOutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.Inflater;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SAML sign-in from end to end with a stand-in identity provider: the factory's request, a response signed with the
 * test identity provider's key (src/test/resources/saml), the checks Spring Security makes on it, and the factory
 * user that results. Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest(properties = {"factory.auth.mode=saml", "factory.auth.admin-users=saml.lead@bank.local",
        "factory.auth.saml.username-attribute=email",
        "factory.auth.saml.display-name-attribute=displayName",
        "factory.auth.saml.email-attribute=email",
        "spring.security.saml2.relyingparty.registration.sso.assertingparty.entity-id=" + SamlIntegrationTest.IDP,
        "spring.security.saml2.relyingparty.registration.sso.assertingparty.singlesignon.url=" + SamlIntegrationTest.IDP + "/sso",
        "spring.security.saml2.relyingparty.registration.sso.assertingparty.singlesignon.sign-request=false",
        "spring.security.saml2.relyingparty.registration.sso.assertingparty.verification.credentials[0].certificate-location=classpath:saml/idp.crt"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class SamlIntegrationTest {

    static final String IDP = "https://idp.bank.local";
    static final String SP = "http://localhost/saml2/service-provider-metadata/sso";
    static final String ACS = "http://localhost/login/saml2/sso/sso";
    private static final Pattern REQUEST_ID = Pattern.compile("\\bID=\"([^\"]+)\"");

    @TempDir
    static Path temp;

    private static X509Certificate idpCertificate;
    private static PrivateKey idpKey;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.storage.root", () -> temp.resolve("data").toString());
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    @BeforeAll
    static void loadIdentityProviderKey() throws Exception {
        OpenSamlInitializationService.initialize();
        try (var in = new ClassPathResource("saml/idp.crt").getInputStream()) {
            idpCertificate = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(in);
        }
        String pem = new ClassPathResource("saml/idp.key").getContentAsString(StandardCharsets.US_ASCII)
                .replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        idpKey = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private UserDirectory directory;

    @Test
    void signsInWithASignedResponseFromTheIdentityProvider() throws Exception {
        mvc.perform(get("/api/auth/config"))
                .andExpect(jsonPath("$.mode").value("saml"))
                .andExpect(jsonPath("$.ssoLoginUrl").value("saml2/authenticate/sso"));
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"x\", \"password\": \"y\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/saml2/metadata/sso"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("entityID=\"" + SP + "\"")))
                .andExpect(content().string(containsString("Location=\"" + ACS + "\"")));

        MockHttpSession session = new MockHttpSession();
        String requestId = startSignIn(session);

        // The identity provider posts back cross-site, without the factory's CSRF token.
        mvc.perform(post("/login/saml2/sso/sso").session(session)
                        .param("SAMLResponse", response(requestId, "SAML.Lead@Bank.Local", r -> {
                        })))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/"));
        mvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("saml.lead@bank.local"))
                .andExpect(jsonPath("$.displayName").value("Lakshmi Iyer"))
                .andExpect(jsonPath("$.source").value("SAML"))
                .andExpect(jsonPath("$.admin").value(true));
        AppUser user = directory.find("saml.lead@bank.local");
        assertThat(user.getEmail()).isEqualTo("SAML.Lead@Bank.Local");
        assertThat(user.getSource()).isEqualTo(AppUser.Source.SAML);
    }

    @Test
    void refusesResponsesThatAreAlteredUnsignedForOthersOrNotRequested() throws Exception {
        // Changed after signing: the signature no longer matches.
        MockHttpSession session = new MockHttpSession();
        String id = startSignIn(session);
        String signed = new String(Base64.getDecoder().decode(response(id, "dev@bank.local", r -> {
        })), StandardCharsets.UTF_8);
        String altered = signed.replace("dev@bank.local", "admin@bank.local");
        assertThat(altered).isNotEqualTo(signed);
        refused(session, Base64.getEncoder().encodeToString(altered.getBytes(StandardCharsets.UTF_8)));

        // For another service provider.
        session = new MockHttpSession();
        id = startSignIn(session);
        refused(session, response(id, "dev@bank.local", r -> audience(r, "https://other-app.bank.local")));

        // Not signed at all.
        session = new MockHttpSession();
        id = startSignIn(session);
        refused(session, response(id, "dev@bank.local", r -> r.setSignature(null), false));

        // An answer to a request this browser session never made.
        session = new MockHttpSession();
        startSignIn(session);
        refused(session, response("_" + UUID.randomUUID(), "dev@bank.local", r -> {
        }));

        // Expired.
        session = new MockHttpSession();
        id = startSignIn(session);
        refused(session, response(id, "dev@bank.local", r -> r.getAssertions().getFirst().getConditions()
                .setNotOnOrAfter(Instant.now().minusSeconds(3600))));

        // A disabled factory account.
        String blockedName = "blocked-" + UUID.randomUUID().toString().substring(0, 8) + "@bank.local";
        AppUser blocked = directory.create(blockedName, "Blocked User", blockedName, null, false);
        directory.update(blocked.getId(), null, null, false, "admin");
        session = new MockHttpSession();
        id = startSignIn(session);
        refused(session, response(id, blockedName, r -> {
        }));
    }

    /** Starts sign-in like the "Sign in with single sign-on" link and returns the ID of the factory's request. */
    private String startSignIn(MockHttpSession session) throws Exception {
        MvcResult redirect = mvc.perform(get("/saml2/authenticate/sso").session(session))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", startsWith(IDP + "/sso?SAMLRequest=")))
                .andReturn();
        String encoded = UriComponentsBuilder.fromUriString(redirect.getResponse().getHeader("Location")).build()
                .getQueryParams().getFirst("SAMLRequest");
        byte[] deflated = Base64.getDecoder().decode(URLDecoder.decode(encoded, StandardCharsets.UTF_8));
        Inflater inflater = new Inflater(true);
        inflater.setInput(deflated);
        ByteArrayOutputStream xml = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        while (!inflater.finished()) {
            int n = inflater.inflate(buffer);
            if (n == 0 && inflater.needsInput()) {
                break;
            }
            xml.write(buffer, 0, n);
        }
        String request = xml.toString(StandardCharsets.UTF_8);
        assertThat(request).contains("AssertionConsumerServiceURL=\"" + ACS + "\"");
        Matcher matcher = REQUEST_ID.matcher(request);
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private void refused(MockHttpSession session, String samlResponse) throws Exception {
        mvc.perform(post("/login/saml2/sso/sso").session(session).param("SAMLResponse", samlResponse))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/?signInError=sso"));
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }

    private static String response(String inResponseTo, String email, Consumer<Response> change) throws Exception {
        return response(inResponseTo, email, change, true);
    }

    /** A response like an identity provider sends: an assertion about the user, signed with the test key. */
    private static String response(String inResponseTo, String email, Consumer<Response> change, boolean sign) throws Exception {
        Instant now = Instant.now();
        Response response = build(Response.DEFAULT_ELEMENT_NAME);
        response.setID("_" + UUID.randomUUID());
        response.setInResponseTo(inResponseTo);
        response.setIssueInstant(now);
        response.setDestination(ACS);
        response.setIssuer(issuer());
        Status status = build(Status.DEFAULT_ELEMENT_NAME);
        StatusCode code = build(StatusCode.DEFAULT_ELEMENT_NAME);
        code.setValue(StatusCode.SUCCESS);
        status.setStatusCode(code);
        response.setStatus(status);

        Assertion assertion = build(Assertion.DEFAULT_ELEMENT_NAME);
        assertion.setID("_" + UUID.randomUUID());
        assertion.setIssueInstant(now);
        assertion.setIssuer(issuer());
        Subject subject = build(Subject.DEFAULT_ELEMENT_NAME);
        NameID nameId = build(NameID.DEFAULT_ELEMENT_NAME);
        nameId.setFormat(NameID.TRANSIENT);
        nameId.setValue("_" + UUID.randomUUID());
        subject.setNameID(nameId);
        SubjectConfirmation confirmation = build(SubjectConfirmation.DEFAULT_ELEMENT_NAME);
        confirmation.setMethod(SubjectConfirmation.METHOD_BEARER);
        SubjectConfirmationData data = build(SubjectConfirmationData.DEFAULT_ELEMENT_NAME);
        data.setInResponseTo(inResponseTo);
        data.setRecipient(ACS);
        data.setNotOnOrAfter(now.plusSeconds(300));
        confirmation.setSubjectConfirmationData(data);
        subject.getSubjectConfirmations().add(confirmation);
        assertion.setSubject(subject);
        Conditions conditions = build(Conditions.DEFAULT_ELEMENT_NAME);
        conditions.setNotBefore(now.minusSeconds(60));
        conditions.setNotOnOrAfter(now.plusSeconds(300));
        AudienceRestriction restriction = build(AudienceRestriction.DEFAULT_ELEMENT_NAME);
        Audience audience = build(Audience.DEFAULT_ELEMENT_NAME);
        audience.setURI(SP);
        restriction.getAudiences().add(audience);
        conditions.getAudienceRestrictions().add(restriction);
        assertion.setConditions(conditions);
        AuthnStatement authn = build(AuthnStatement.DEFAULT_ELEMENT_NAME);
        authn.setAuthnInstant(now);
        authn.setSessionIndex("_" + UUID.randomUUID());
        AuthnContext context = build(AuthnContext.DEFAULT_ELEMENT_NAME);
        AuthnContextClassRef classRef = build(AuthnContextClassRef.DEFAULT_ELEMENT_NAME);
        classRef.setURI(AuthnContext.PPT_AUTHN_CTX);
        context.setAuthnContextClassRef(classRef);
        authn.setAuthnContext(context);
        assertion.getAuthnStatements().add(authn);
        AttributeStatement attributes = build(AttributeStatement.DEFAULT_ELEMENT_NAME);
        Map.of("email", email, "displayName", email.startsWith("SAML.Lead") ? "Lakshmi Iyer" : "Dev User")
                .forEach((name, value) -> attributes.getAttributes().add(attribute(name, value)));
        assertion.getAttributeStatements().add(attributes);
        response.getAssertions().add(assertion);

        change.accept(response);
        if (sign) {
            SignatureSigningParameters parameters = new SignatureSigningParameters();
            parameters.setSigningCredential(CredentialSupport.getSimpleCredential(idpCertificate, idpKey));
            parameters.setSignatureAlgorithm(SignatureConstants.ALGO_ID_SIGNATURE_RSA_SHA256);
            parameters.setSignatureReferenceDigestMethod(SignatureConstants.ALGO_ID_DIGEST_SHA256);
            parameters.setSignatureCanonicalizationAlgorithm(SignatureConstants.ALGO_ID_C14N_EXCL_OMIT_COMMENTS);
            SignatureSupport.signObject(assertion, parameters);
        }
        String xml = SerializeSupport.nodeToString(XMLObjectSupport.marshall(response));
        return Base64.getEncoder().encodeToString(xml.getBytes(StandardCharsets.UTF_8));
    }

    private static void audience(Response response, String uri) {
        response.getAssertions().getFirst().getConditions().getAudienceRestrictions().getFirst().getAudiences().getFirst().setURI(uri);
    }

    private static Issuer issuer() {
        Issuer issuer = build(Issuer.DEFAULT_ELEMENT_NAME);
        issuer.setValue(IDP);
        return issuer;
    }

    private static Attribute attribute(String name, String value) {
        Attribute attribute = build(Attribute.DEFAULT_ELEMENT_NAME);
        attribute.setName(name);
        XSString text = (XSString) XMLObjectProviderRegistrySupport.getBuilderFactory().getBuilder(XSString.TYPE_NAME)
                .buildObject(AttributeValue.DEFAULT_ELEMENT_NAME, XSString.TYPE_NAME);
        text.setValue(value);
        attribute.getAttributeValues().add(text);
        return attribute;
    }

    @SuppressWarnings("unchecked")
    private static <T> T build(QName name) {
        XMLObjectBuilderFactory factory = XMLObjectProviderRegistrySupport.getBuilderFactory();
        return (T) factory.getBuilder(name).buildObject(name);
    }
}
