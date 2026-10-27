package com.bank.obdx.payments;

import javax.annotation.security.RolesAllowed;
import javax.ws.rs.*;

@Path("/payments/payees")
public class PayeeResource {
    @GET
    @RolesAllowed({"RetailUser"})
    public Object list() { return null; }

    @POST
    @RolesAllowed({"RetailUser", "CorporateMaker"})
    public Object add(Object payee) { return null; }
}
