#!/usr/bin/env bash
# Ejecuta el CLI de .NET 10 dentro de Docker (el host no tiene SDK instalado).
# Uso: ./scripts/dotnet.sh <args de dotnet>   p. ej. ./scripts/dotnet.sh build backend/Asistencia.sln
# Los archivos generados quedan con el usuario del host. La caché de NuGet se reutiliza en ~/.nuget.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.nuget/packages" "$HOME/.dotnet_docker_home"
exec docker run --rm -i \
  -u "$(id -u):$(id -g)" \
  -e HOME=/home_user -e DOTNET_CLI_HOME=/home_user -e DOTNET_CLI_TELEMETRY_OPTOUT=1 -e DOTNET_NOLOGO=1 \
  -e NUGET_PACKAGES=/nuget \
  -v "$HOME/.nuget/packages:/nuget" \
  -v "$HOME/.dotnet_docker_home:/home_user" \
  -v "$ROOT:/src" -w /src \
  ${DOTNET_DOCKER_ARGS:-} \
  mcr.microsoft.com/dotnet/sdk:10.0 dotnet "$@"
