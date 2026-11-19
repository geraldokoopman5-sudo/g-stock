FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /source

COPY src/Gstock.Contracts/Gstock.Contracts.csproj src/Gstock.Contracts/
COPY src/Gstock.Api/Gstock.Api.csproj src/Gstock.Api/

RUN dotnet restore src/Gstock.Api/Gstock.Api.csproj

COPY src/ src/
COPY migrations/ migrations/

RUN dotnet publish src/Gstock.Api/Gstock.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsodium23 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish/ ./
COPY certificates/supabase-ca.crt /app/certificates/supabase-ca.crt

USER $APP_UID

CMD ["sh", "-c", "exec dotnet Gstock.Api.dll --urls http://0.0.0.0:${PORT:-8080}"]