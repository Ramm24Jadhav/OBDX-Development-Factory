package com.obdx.factory.componentpack;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the premium JET pack's elements (target-packs/components/jet-premium/bx) at /packs/jet-premium/, so the
 * factory's own pages (Component mapping, Component factory) show the real bx- elements beside the JET ones. The files
 * are the pack as banks get it; nothing is changed for the factory.
 */
@Configuration
public class PackResources implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/packs/jet-premium/**").addResourceLocations("classpath:/target-packs/components/jet-premium/bx/");
    }
}
