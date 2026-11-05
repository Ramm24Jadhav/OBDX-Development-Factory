package com.obdx.factory.modernization;

import com.obdx.factory.componentpack.ComponentRegistry;
import com.obdx.factory.target.TargetPack;
import com.obdx.factory.target.TargetPacks;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The migration path's Technology catalogue (target-packs/catalogue.json): technologies that keep OBDX as it is, each
 * with the target pack that writes it. Readiness comes from the factory itself: ready when the target pack is installed,
 * in progress when only its component pack is (Angular), planned otherwise. The pack's numbers are its own.
 */
@Component
public class TechnologyCatalogue {

    /** What a target pack holds, counted from the pack. */
    public record PackFacts(String id, String title, String description, int rules, int templates, int starterFiles, int components,
                            String defaultAppFolder, List<String> ruleTitles) {
    }

    /** readiness: ready, in-progress or planned. replaces: premium components of the pack with the JET element they replace. */
    public record Technology(String id, String pack, String platform, String name, String logo, String text, String meta, String language,
                             String usedByBanks, boolean besideJet, List<String> points, List<String[]> limits, String readiness,
                             PackFacts facts, List<String[]> replaces) {
    }

    public record Catalogue(List<Technology> technologies, List<String[]> notOffered, List<String[]> obdxRules) {
    }

    private final JsonNode data;
    private final TargetPacks packs;
    private final ComponentRegistry registry;

    public TechnologyCatalogue(ObjectMapper json, TargetPacks packs, ComponentRegistry registry) {
        this.packs = packs;
        this.registry = registry;
        try (InputStream in = TechnologyCatalogue.class.getResourceAsStream("/target-packs/catalogue.json")) {
            if (in == null) {
                throw new IllegalStateException("target-packs/catalogue.json is missing from the factory");
            }
            this.data = json.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read target-packs/catalogue.json", e);
        }
    }

    public Catalogue catalogue() {
        List<Technology> list = new ArrayList<>();
        for (JsonNode t : data.path("technologies")) {
            String pack = t.path("pack").asString();
            Optional<TargetPack> target = packs.find(pack);
            ComponentRegistry.Pack components = registry.pack(pack);
            String readiness = target.isPresent() ? "ready" : components != null ? "in-progress" : "planned";
            PackFacts facts = target.map(p -> new PackFacts(p.id(), p.title(), p.description(), p.rules().size(), p.templates().size(), p.starter().size(),
                    p.components().size(), p.defaultAppFolder(), p.rules().stream().map(com.obdx.factory.pack.PackRule::title).limit(12).toList())).orElse(null);
            List<String[]> replaces = new ArrayList<>();
            if (components != null) {
                registry.categories().stream().flatMap(c -> c.components().stream()).filter(e -> "element".equals(e.workspace().kind()) && e.names().containsKey(pack))
                        .filter(ComponentRegistry.Entry::foundation).limit(12).forEach(e -> replaces.add(new String[]{e.names().get(pack), e.workspace().element()}));
            }
            list.add(new Technology(t.path("id").asString(), pack, t.path("platform").asString(), t.path("name").asString(), t.path("logo").asString(),
                    t.path("text").asString(), t.path("meta").asString(), t.path("language").asString(), t.path("usedByBanks").asString(),
                    t.path("besideJet").asBoolean(false), strings(t.path("points")), pairs(t.path("limits")), readiness, facts, replaces));
        }
        return new Catalogue(list, pairs(data.path("notOffered")), RunBriefs.OBDX_RULES);
    }

    public Optional<Technology> find(String id) {
        return catalogue().technologies().stream().filter(t -> t.id().equals(id)).findFirst();
    }

    private static List<String> strings(JsonNode node) {
        List<String> out = new ArrayList<>();
        node.forEach(v -> out.add(v.asString()));
        return out;
    }

    private static List<String[]> pairs(JsonNode node) {
        List<String[]> out = new ArrayList<>();
        node.forEach(v -> out.add(new String[]{v.path(0).asString(), v.path(1).asString()}));
        return out;
    }
}
