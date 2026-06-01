# ============================================================
# ВариантУм Backend Dockerfile
# Многоступенчатая сборка: build (Maven+JDK) → runtime (JRE+Tesseract)
# ============================================================

# ---------- STAGE 1: build ----------
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /workspace

# Кэшируем зависимости отдельным слоем
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---------- STAGE 2: runtime ----------
FROM eclipse-temurin:21-jre-jammy

# Tesseract OCR + русская модель (нужно для Tess4J)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-rus \
        tesseract-ocr-eng \
        libtesseract-dev \
        fontconfig \
        fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/4.00/tessdata/

WORKDIR /app
COPY --from=build /workspace/target/variantum-backend.jar app.jar

EXPOSE 8080

ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
