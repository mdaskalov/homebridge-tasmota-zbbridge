# Binding with Zigbee2Tasmota

You can add switches or sensors to HomeKit to control automations or bind them with other devices or groups for direct control.

Note: when a device is bound to a group you have to listen to the group messages for device status updates. By default EZSP will not report group messages unless you subscribe to the group.

IKEA remotes (with old firmware) only support 1 group and can be linked to a light only via group numbers (no direct binding).

Type following commands in the Tasmota console to bind a switch to a light:

1. Add the light to group 10

```
ZbSend {"Device":"IKEA_Light","Send":{"AddGroup":10}}
```

2. Bind the remote to group 10. Note: you need to press a button on the remote right before sending this command to make sure it's not in sleep mode

```
ZbBind {"Device":"IKEA_Remote","ToGroup":10,"Cluster":6}
```

3. Activate EZSP to listen to the group messages so the HomeKit device is updated each time a group command is received (Not necessary for CC2530 devices)

```
ZbListen1 10
```

You can also bind devices as usual using the link button. Then you have to find out the automatically generated group and activate EZSP to listen to this group:

1. Get all device groups:

```
ZbSend {"Device":"IKEA_Light","Send":{"GetAllGroups":true}}
tele/zbbridge/SENSOR = {"ZbReceived":{"0x303F":{"Device":"0x303F","Name":"IKEA_Light","0004<02":"FF01AFE0","GetGroupCapacity":255,"GetGroupCount":1,"GetGroup":[57519],"Endpoint":1,"LinkQuality":108}}}
```

3. Activate EZSP to listen to the group messages for the reported group (Not necessary for CC2530 devices)

```
ZbListen1 57519
```

The listen commands should be executed after each reboot. Alternatively a rule to execute them when the zigbee is initialized on boot could be created:

1. Create the rule:

```
RULE1 ON ZbState#status=0 DO Backlog ZbListen1 10; ZbListen2 57519 ENDON
```

2. Activate it:

```
RULE1 1
```
