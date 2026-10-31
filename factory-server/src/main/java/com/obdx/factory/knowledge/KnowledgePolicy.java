package com.obdx.factory.knowledge;

import com.obdx.factory.model.ModelSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Keeps the knowledge base inside the bank. Its content (manual excerpts, the bank's own documents, notes and their
 * embeddings) is sent only to model servers on the bank's network: this computer, private and link-local addresses
 * (the host name is resolved, and every address must be private), or hosts an administrator lists in
 * factory.knowledge.internal-hosts. Anything else, including a name that does not resolve, counts as outside unless
 * factory.knowledge.external-models is true. Works with whichever models are configured on the Models page.
 */
@Component
public class KnowledgePolicy {

    private static final Logger log = LoggerFactory.getLogger(KnowledgePolicy.class);
    private static final long CACHE_MILLIS = 60_000;

    private final ModelSettings settings;
    private final KnowledgeProperties properties;
    private final Map<String, Checked> checked = new ConcurrentHashMap<>();

    public KnowledgePolicy(ModelSettings settings, KnowledgeProperties properties) {
        this.settings = settings;
        this.properties = properties;
    }

    private record Checked(boolean internal, long at) {
    }

    /** Whether questions and knowledge may go to the chat model. */
    public boolean chatAllowed() {
        return allowed(settings.current().baseUrl());
    }

    /** Whether sections, notes and questions may be embedded by the embedding model. */
    public boolean embeddingAllowed() {
        return allowed(settings.current().embeddingUrl());
    }

    /** What to tell users when the knowledge cannot go to the chat model; null when it can. */
    public String chatProblem() {
        return chatAllowed() ? null : outside("chat", settings.current().baseUrl());
    }

    /** What to tell users when the knowledge cannot be embedded; null when it can. */
    public String embeddingProblem() {
        return embeddingAllowed() ? null : outside("embedding", settings.current().embeddingUrl());
    }

    private static String outside(String kind, String url) {
        return "The knowledge base stays inside the bank: the " + kind + " model server " + host(url) + " is outside the bank's "
                + "network. Use a model server on the bank's network, or have an administrator list it in "
                + "factory.knowledge.internal-hosts.";
    }

    private boolean allowed(String url) {
        if (properties.externalModels()) {
            return true;
        }
        String host = host(url);
        if (host.isEmpty()) {
            return false;
        }
        Checked c = checked.get(host);
        if (c == null || System.currentTimeMillis() - c.at() > CACHE_MILLIS) {
            c = new Checked(internal(host), System.currentTimeMillis());
            checked.put(host, c);
            if (!c.internal()) {
                log.info("Model server {} is outside the bank's network: the knowledge base is not sent to it", host);
            }
        }
        return c.internal();
    }

    boolean internal(String host) {
        for (String listed : properties.internalHosts()) {
            String l = listed.strip().toLowerCase(Locale.ROOT);
            if (!l.isEmpty() && (host.equals(l) || (l.startsWith(".") && host.endsWith(l)))) {
                return true;
            }
        }
        try {
            InetAddress[] addresses = InetAddress.getAllByName(host);
            for (InetAddress a : addresses) {
                if (!privateAddress(a)) {
                    return false;
                }
            }
            return addresses.length > 0;
        } catch (UnknownHostException e) {
            return false;
        }
    }

    static boolean privateAddress(InetAddress a) {
        if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()) {
            return true;
        }
        byte[] b = a.getAddress();
        // IPv6 unique local addresses (fc00::/7) are the private range of IPv6
        return b.length == 16 && (b[0] & 0xfe) == 0xfc;
    }

    static String host(String url) {
        try {
            String host = url == null ? null : URI.create(url.strip()).getHost();
            return host == null ? "" : host.toLowerCase(Locale.ROOT).replaceAll("^\\[|]$", "");
        } catch (IllegalArgumentException e) {
            return "";
        }
    }
}
