package com.bank.obdx.forms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormModelTest {
    @Test
    fun checksRequiredAndLengthRulesAndClearsAMessageWhenTheFieldChanges() {
        val form = FormModel(
            mapOf("payee" to "", "remarks" to "x".repeat(20), "amount" to null),
            mapOf(
                "payee" to FieldRule(label = "Payee", required = true),
                "remarks" to FieldRule(label = "Remarks", maxLength = 10),
                "amount" to FieldRule(label = "Amount", required = true),
            ),
        )
        assertFalse(form.validate())
        assertEquals("Enter Payee.", form.error("payee"))
        assertEquals("Remarks can have at most 10 characters.", form.error("remarks"))
        form.set("payee", "A. Rao")
        assertNull(form.error("payee"))
        form.set("remarks", "Rent")
        form.set("amount", 1250.0)
        assertTrue(form.validate())
        assertEquals(1250.0, form.number("amount"))
    }
}
