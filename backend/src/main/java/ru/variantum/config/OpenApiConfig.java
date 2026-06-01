package ru.variantum.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI variantumOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("ВариантУм API")
                        .description("REST API для генерации школьных заданий через GigaChat")
                        .version("0.1.0")
                        .contact(new Contact().name("Команда ВариантУм").email("hello@variantum.ru"))
                        .license(new License().name("Proprietary")));
    }
}
