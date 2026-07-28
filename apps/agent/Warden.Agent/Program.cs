using Warden.Agent;
using Warden.Core;
using Warden.Core.Services;
using Warden.LockUI;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "Warden Agent";
});
builder.Services.AddHttpClient();
builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddSingleton<WardenApiClient>();
builder.Services.AddSingleton<EnforcementEngine>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
