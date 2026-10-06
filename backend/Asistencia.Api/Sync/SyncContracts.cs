using System.Text.Json;
using System.Text.Json.Serialization;

namespace Asistencia.Api.Sync;

public sealed class SyncPushRequest
{
    [JsonPropertyName("deviceId")]
    public Guid DeviceId { get; set; }

    [JsonPropertyName("items")]
    public List<SyncPushItem> Items { get; set; } = [];
}

public sealed class SyncPushItem
{
    [JsonPropertyName("entity")]
    public string Entity { get; set; } = "";

    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("baseVersion")]
    public int BaseVersion { get; set; }

    [JsonPropertyName("clientUpdatedAt")]
    public DateTimeOffset? ClientUpdatedAt { get; set; }

    [JsonPropertyName("data")]
    public JsonElement Data { get; set; }
}

public static class SyncItemStatus
{
    public const string Accepted = "accepted";
    public const string Duplicate = "duplicate";
    public const string Conflict = "conflict";
    public const string Rejected = "rejected";
}

public sealed class SyncItemResult
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("serverVersion")]
    public int ServerVersion { get; set; }

    [JsonPropertyName("current")]
    public object? Current { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

public sealed class SyncPushResponse
{
    [JsonPropertyName("results")]
    public List<SyncItemResult> Results { get; set; } = [];

    [JsonPropertyName("serverCursor")]
    public long ServerCursor { get; set; }

    [JsonPropertyName("serverTime")]
    public DateTimeOffset ServerTime { get; set; }
}

public sealed class SyncChangesResponse
{
    [JsonPropertyName("nextCursor")]
    public long NextCursor { get; set; }

    [JsonPropertyName("hasMore")]
    public bool HasMore { get; set; }

    [JsonPropertyName("changes")]
    public List<EntityChangeDto> Changes { get; set; } = [];

    [JsonPropertyName("serverTime")]
    public DateTimeOffset ServerTime { get; set; }
}

public sealed class EntityChangeDto
{
    [JsonPropertyName("serverChangeId")]
    public long ServerChangeId { get; set; }

    [JsonPropertyName("entity")]
    public string Entity { get; set; } = "";

    [JsonPropertyName("entityId")]
    public Guid EntityId { get; set; }

    [JsonPropertyName("operation")]
    public string Operation { get; set; } = "";

    [JsonPropertyName("data")]
    public object? Data { get; set; }
}
