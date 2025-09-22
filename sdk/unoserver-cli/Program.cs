using System.CommandLine;
using System.CommandLine.Binding;
using System.Text.Json;
using Unoserver.SDK;
using Unoserver.SDK.Models;

return await BuildCommandLine()
    .InvokeAsync(args);

static RootCommand BuildCommandLine()
{
    // Define a binder for the UnoserverClient to handle the --server global option
    var serverOption = new Option<Uri>(
        name: "--server",
        description: "The base URI of the Unoserver API.",
        getDefaultValue: () => new Uri("http://localhost:3000"));

    var clientBinder = new UnoserverClientBinder(serverOption);

    // Root Command
    var rootCommand = new RootCommand("A CLI for interacting with the Unoserver API.")
    {
        Name = "unoserver-cli"
    };
    rootCommand.AddGlobalOption(serverOption);

    // Status Command
    var serializerOptions = new JsonSerializerOptions { WriteIndented = true, PropertyNameCaseInsensitive = true };

    var statusCommand = new Command("status", "Get the status of the conversion queue.");
    statusCommand.SetHandler(async client =>
    {
        try
        {
            var status = await client.GetQueueStatusAsync();
            Console.WriteLine(JsonSerializer.Serialize(status, serializerOptions));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
        }
    }, clientBinder);
    rootCommand.AddCommand(statusCommand);

    // Convert Command
    var fileOption = new Option<FileInfo>(
        aliases: ["--file", "-f"],
        description: "The input file to convert.")
    { IsRequired = true }.ExistingOnly();

    var formatOption = new Option<ConversionFormat>(
        aliases: ["--format", "-t"],
        description: "The target format (e.g., pdf, docx).")
    { IsRequired = true };

    var outputOption = new Option<FileInfo>(
        aliases: ["--output", "-o"],
        description: "The path to save the converted file. If not provided, the output will be saved in the same directory as the input file.");
    
    var filterOption = new Option<string>(
        name: "--filter",
        description: "Optional: A custom conversion filter (e.g., 'writer_pdf_Export').");

    var convertCommand = new Command("convert", "Convert a file to a different format.")
    {
        fileOption,
        formatOption,
        outputOption,
        filterOption
    };

    convertCommand.SetHandler(async (client, file, format, output, filter) =>
    {
        try
        {
            Console.WriteLine($"Converting '{file.FullName}' to '{format}'...");

            await using var fileStream = file.OpenRead();

            var resultStream = await client.Convert()
                .WithFile(fileStream, file.Name)
                .ToFormat(format)
                .WithFilter(filter)
                .ExecuteAsync();

            var outputPath = output?.FullName ?? Path.Combine(file.DirectoryName ?? "", $"{Path.GetFileNameWithoutExtension(file.FullName)}.{format.ToString().ToLower()}");

            await using var outputFileStream = File.Create(outputPath);
            await resultStream.CopyToAsync(outputFileStream);

            Console.WriteLine($"File converted successfully to '{outputPath}'");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
        }
    }, clientBinder, fileOption, formatOption, outputOption, filterOption);
    rootCommand.AddCommand(convertCommand);

    return rootCommand;
}

public class UnoserverClientBinder : BinderBase<UnoserverClient>
{
    private readonly Option<Uri> _serverOption;

    public UnoserverClientBinder(Option<Uri> serverOption)
    {
        _serverOption = serverOption;
    }

    protected override UnoserverClient GetBoundValue(BindingContext bindingContext)
    {
        var serverUri = bindingContext.ParseResult.GetValueForOption(_serverOption);
        var httpClient = new HttpClient { BaseAddress = serverUri };
        return new UnoserverClient(httpClient);
    }
}