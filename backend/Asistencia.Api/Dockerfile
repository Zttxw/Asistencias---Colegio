FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/Asistencia.sln ./backend/
COPY backend/Asistencia.Api/Asistencia.Api.csproj ./backend/Asistencia.Api/
COPY backend/Asistencia.Tests/Asistencia.Tests.csproj ./backend/Asistencia.Tests/

RUN dotnet restore backend/Asistencia.Api/Asistencia.Api.csproj

COPY backend/Asistencia.Api/ ./backend/Asistencia.Api/

RUN dotnet publish backend/Asistencia.Api/Asistencia.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5080
EXPOSE 5080

ENTRYPOINT ["dotnet", "Asistencia.Api.dll"]
