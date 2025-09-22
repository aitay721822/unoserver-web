using System.Text.Json.Serialization;

namespace Unoserver.SDK.Models;

/// <summary>
/// Represents the status of a single worker.
/// </summary>
public record WorkerStatus(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("inUse")] bool InUse,
    [property: JsonPropertyName("isRestarting")] bool IsRestarting,
    [property: JsonPropertyName("skipRestartCount")] int SkipRestartCount
);
