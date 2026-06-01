package ru.variantum.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.ssl.SslContext;
import io.netty.handler.ssl.SslContextBuilder;
import io.netty.handler.ssl.util.InsecureTrustManagerFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import javax.net.ssl.SSLException;
import java.time.Duration;

/**
 * WebClient для GigaChat API.
 * Использует InsecureTrustManagerFactory — сертификаты Сбера не входят в JVM-truststore.
 * В prod нужно импортировать CA Минцифры в truststore и убрать bypass.
 */
@Configuration
@RequiredArgsConstructor
public class GigaChatConfig {

    private final AppProperties appProperties;

    @Bean("gigachatWebClient")
    public WebClient gigachatWebClient() throws SSLException {
        AppProperties.GigaChat g = appProperties.gigachat();
        SslContext sslCtx = SslContextBuilder.forClient()
                .trustManager(InsecureTrustManagerFactory.INSTANCE)
                .build();
        HttpClient httpClient = HttpClient.create()
                .secure(t -> t.sslContext(sslCtx))
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 15_000)  // 15s connect timeout
                .responseTimeout(Duration.ofSeconds(g.timeoutSeconds()));

        return WebClient.builder()
                .baseUrl(g.apiUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(c -> c.defaultCodecs().maxInMemorySize(8 * 1024 * 1024))
                .build();
    }

    @Bean("gigachatAuthWebClient")
    public WebClient gigachatAuthWebClient() throws SSLException {
        SslContext sslCtx = SslContextBuilder.forClient()
                .trustManager(InsecureTrustManagerFactory.INSTANCE)
                .build();
        HttpClient httpClient = HttpClient.create()
                .secure(t -> t.sslContext(sslCtx));

        // Нет baseUrl — полный URL передаётся в каждом вызове
        return WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }
}
