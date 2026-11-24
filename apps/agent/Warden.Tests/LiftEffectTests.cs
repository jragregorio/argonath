using Warden.LockUI;
using Xunit;

namespace Warden.Tests;

public class LiftEffectTests
{
    [Fact]
    public void Resting_button_sits_flat_with_no_shadow()
    {
        var t = LiftEffect.TargetFor(enabled: true, over: false, pressed: false, lift: 2);
        Assert.Equal(new LiftTarget(0, 0, 0), t);
    }

    [Fact]
    public void Hovered_button_floats_up_with_shadow_and_highlight()
    {
        var t = LiftEffect.TargetFor(enabled: true, over: true, pressed: false, lift: 2);
        Assert.Equal(new LiftTarget(-2, 1, 1), t);
    }

    [Fact]
    public void Pressed_button_sinks_below_rest_and_drops_the_shadow()
    {
        var t = LiftEffect.TargetFor(enabled: true, over: true, pressed: true, lift: 2);
        Assert.Equal(new LiftTarget(1, 0, 1), t);
    }

    [Fact]
    public void Dragging_off_a_pressed_button_returns_it_to_rest()
    {
        var t = LiftEffect.TargetFor(enabled: true, over: false, pressed: true, lift: 2);
        Assert.Equal(new LiftTarget(0, 0, 0), t);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public void Disabled_button_never_moves(bool over, bool pressed)
    {
        var t = LiftEffect.TargetFor(enabled: false, over: over, pressed: pressed, lift: 2);
        Assert.Equal(new LiftTarget(0, 0, 0), t);
    }

    [Fact]
    public void Lift_height_is_configurable()
    {
        Assert.Equal(-3, LiftEffect.TargetFor(true, true, false, lift: 3).OffsetY);
    }
}
