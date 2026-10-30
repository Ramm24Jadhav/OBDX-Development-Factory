package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The knowledge base goes only to model servers on the bank's network. */
class KnowledgePolicyTest {

    private static KnowledgePolicy policy(List<String> internalHosts) {
        return new KnowledgePolicy(null, new KnowledgeProperties(false, internalHosts, 5, 1000, 3000, 8000, true, null));
    }

    @Test
    void serversOnThisComputerAndPrivateAddressesAreInside() {
        KnowledgePolicy p = policy(List.of());
        assertThat(p.internal("localhost")).isTrue();
        assertThat(p.internal("127.0.0.1")).isTrue();
        assertThat(p.internal("10.20.30.40")).isTrue();
        assertThat(p.internal("172.16.5.9")).isTrue();
        assertThat(p.internal("192.168.1.20")).isTrue();
        assertThat(p.internal("fd12:3456::1")).isTrue();
        assertThat(p.internal("::1")).isTrue();
    }

    @Test
    void publicAddressesAndUnknownNamesAreOutside() {
        KnowledgePolicy p = policy(List.of());
        assertThat(p.internal("8.8.8.8")).isFalse();
        assertThat(p.internal("172.32.0.1")).isFalse();
        assertThat(p.internal("2001:4860::8888")).isFalse();
        assertThat(p.internal("no-such-host.invalid")).isFalse();
    }

    @Test
    void listedHostsAndDomainsAreInside() {
        KnowledgePolicy p = policy(List.of("llm.bank.example", " .ai.bank.example "));
        assertThat(p.internal("llm.bank.example")).isTrue();
        assertThat(p.internal("gpu1.ai.bank.example")).isTrue();
        assertThat(p.internal("ai.bank.example.attacker.invalid")).isFalse();
    }

    @Test
    void readsTheHostOfAServerUrl() {
        assertThat(KnowledgePolicy.host("http://LocalHost:11434/v1")).isEqualTo("localhost");
        assertThat(KnowledgePolicy.host("https://[fd00::5]:8443/v1")).isEqualTo("fd00::5");
        assertThat(KnowledgePolicy.host("not a url")).isEmpty();
        assertThat(KnowledgePolicy.host(null)).isEmpty();
    }
}
