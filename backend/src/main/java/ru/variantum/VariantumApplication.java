package ru.variantum;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@ConfigurationPropertiesScan("ru.variantum.config")
@EnableAsync
public class VariantumApplication {

    public static void main(String[] args) {
        SpringApplication.run(VariantumApplication.class, args);
    }
}
